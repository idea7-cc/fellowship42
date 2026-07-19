import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { Context } from 'hono'
import { AppError } from './errors'

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()
const LAST_SEEN_WRITE_INTERVAL_MS = 15 * 60 * 1000

export interface AccessIdentity {
  provider: 'cloudflare-access'
  subject: string
  email: string
  firstName: string
  lastName: string
}

export interface CurrentUser {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl?: string
}

type AppContext = Context<{
  Bindings: Env
  Variables: {
    identity: AccessIdentity | null
    requestId: string
  }
}>

function textClaim(payload: JWTPayload, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function namesFromPayload(payload: JWTPayload, email: string) {
  const givenName = textClaim(payload, 'given_name')
  const familyName = textClaim(payload, 'family_name')
  const name = textClaim(payload, 'name')

  if (givenName || familyName) {
    return { firstName: givenName ?? '', lastName: familyName ?? '' }
  }

  if (name) {
    const [firstName, ...rest] = name.trim().split(/\s+/)
    return { firstName, lastName: rest.join(' ') }
  }

  return { firstName: email.split('@')[0], lastName: '' }
}

export async function resolveAccessIdentity(
  request: Request,
  env: Env,
): Promise<AccessIdentity | null> {
  const token = request.headers.get('cf-access-jwt-assertion')
  const issuer = env.ACCESS_TEAM_DOMAIN.trim()
  const audience = env.ACCESS_AUD.trim()

  if (!token || !issuer || !audience) return null

  let jwks = jwksByIssuer.get(issuer)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, '')}/cdn-cgi/access/certs`))
    jwksByIssuer.set(issuer, jwks)
  }
  const { payload } = await jwtVerify(token, jwks, { issuer, audience })
  const email = textClaim(payload, 'email')
  const subject = payload.sub

  if (!email || !subject) {
    throw new AppError(401, 'invalid_identity', 'The Access token is missing identity claims')
  }

  return {
    provider: 'cloudflare-access',
    subject,
    email: email.toLowerCase(),
    ...namesFromPayload(payload, email),
  }
}

export async function syncCurrentUser(
  db: D1Database,
  identity: AccessIdentity,
): Promise<CurrentUser> {
  const existing = await db
    .prepare(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url
           , u.status, u.last_seen_at
      FROM auth_identities ai
      JOIN users u ON u.id = ai.user_id
      WHERE ai.provider = ? AND ai.subject = ?
    `)
    .bind(identity.provider, identity.subject)
    .first<{
      id: string
      email: string
      first_name: string
      last_name: string
      avatar_url: string | null
      status: 'invited' | 'active' | 'suspended'
      last_seen_at: number | null
    }>()

  const now = Date.now()
  if (existing) {
    if (existing.status === 'suspended') {
      throw new AppError(403, 'account_suspended', 'This account is suspended')
    }

    const profileChanged =
      existing.first_name !== identity.firstName || existing.last_name !== identity.lastName
    const lastSeenExpired =
      !existing.last_seen_at || now - existing.last_seen_at >= LAST_SEEN_WRITE_INTERVAL_MS
    if (profileChanged || lastSeenExpired || existing.status === 'invited') {
      await db.batch([
        db
          .prepare(`
            UPDATE users
            SET first_name = ?, last_name = ?, status = 'active', last_seen_at = ?, updated_at = ?
            WHERE id = ?
          `)
          .bind(identity.firstName, identity.lastName, now, now, existing.id),
        db
          .prepare(`
            UPDATE auth_identities
            SET email_at_provider = ?, updated_at = ?
            WHERE provider = ? AND subject = ?
          `)
          .bind(identity.email, now, identity.provider, identity.subject),
      ])
    }
    return {
      id: existing.id,
      email: existing.email,
      firstName: identity.firstName,
      lastName: identity.lastName,
      avatarUrl: existing.avatar_url ?? undefined,
    }
  }

  const user = await db
    .prepare(`
      INSERT INTO users (
        id, email, first_name, last_name, status, created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        status = CASE WHEN users.status = 'invited' THEN 'active' ELSE users.status END,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
      RETURNING id, email, first_name, last_name, avatar_url, status
    `)
    .bind(
      crypto.randomUUID(),
      identity.email,
      identity.firstName,
      identity.lastName,
      now,
      now,
      now,
    )
    .first<{
      id: string
      email: string
      first_name: string
      last_name: string
      avatar_url: string | null
      status: 'active' | 'suspended'
    }>()
  if (!user) throw new AppError(500, 'identity_sync_failed', 'Unable to create the user session')
  if (user.status === 'suspended') {
    throw new AppError(403, 'account_suspended', 'This account is suspended')
  }

  await db
    .prepare(`
      INSERT INTO auth_identities (
        id, user_id, provider, subject, email_at_provider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, subject) DO UPDATE SET
        email_at_provider = excluded.email_at_provider,
        updated_at = excluded.updated_at
    `)
    .bind(
      crypto.randomUUID(),
      user.id,
      identity.provider,
      identity.subject,
      identity.email,
      now,
      now,
    )
    .run()

  // Re-read through the identity key so concurrent first-session requests and
  // pre-existing identity links always converge on the canonical user.
  return syncCurrentUser(db, identity)
}

export async function requireCurrentUser(c: AppContext): Promise<CurrentUser> {
  const identity = c.get('identity')
  if (!identity) {
    throw new AppError(401, 'authentication_required', 'Authentication is required')
  }
  return syncCurrentUser(c.env.DB, identity)
}

export async function requirePermission(
  c: AppContext,
  churchId: string,
  permission: string,
): Promise<CurrentUser> {
  const user = await requireCurrentUser(c)
  const grant = await c.env.DB
    .prepare(`
      SELECT 1 AS granted
      FROM church_memberships cm
      JOIN membership_roles mr
        ON mr.church_id = cm.church_id AND mr.membership_id = cm.id
      JOIN role_permissions rp ON rp.role_id = mr.role_id
      WHERE cm.church_id = ?
        AND cm.user_id = ?
        AND cm.status = 'active'
        AND (rp.permission = ? OR rp.permission = '*')
      LIMIT 1
    `)
    .bind(churchId, user.id, permission)
    .first<{ granted: number }>()

  if (!grant) {
    throw new AppError(403, 'permission_denied', 'You do not have permission for this action')
  }
  return user
}
