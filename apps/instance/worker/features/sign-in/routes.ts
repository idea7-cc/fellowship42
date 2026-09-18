import { Hono } from 'hono'
import { z } from 'zod'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server'
import { requirePermission, type AccessIdentity } from '../../lib/auth'
import { AppError } from '../../lib/errors'
import { jsonBody, validationError } from '../../lib/content'
import {
  CHALLENGE_SECONDS,
  SESSION_SECONDS,
  cookie,
  cookieName,
  digest,
  readCookie,
  signInOrigin,
  token,
  type SignInEnv,
} from './session'

type AppEnv = {
  Bindings: SignInEnv
  Variables: { identity: AccessIdentity | null; requestId: string }
}
export const signInRoutes = new Hono<AppEnv>()
const invalid = () =>
  new AppError(
    400,
    'sign_in_failed',
    'Sign-in could not be completed. Please start again.',
  )
const capability = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const startSchema = z
  .object({ token: capability, bootstrap: z.boolean().optional() })
  .strict()
// Rechecked inside enrollment mutations, not only at the route boundary.
const issuerAuthority = `EXISTS (SELECT 1 FROM users iu JOIN church_memberships im ON im.user_id=iu.id JOIN membership_roles mr ON mr.church_id=im.church_id AND mr.membership_id=im.id JOIN role_permissions rp ON rp.role_id=mr.role_id WHERE iu.id=local_auth_enrollments.issuer_user_id AND iu.status='active' AND im.church_id=local_auth_enrollments.church_id AND im.status='active' AND rp.permission='*')`
const enrollmentEligibility = `EXISTS (SELECT 1 FROM users u WHERE u.id=local_auth_enrollments.user_id AND u.status='invited') AND NOT EXISTS (SELECT 1 FROM auth_identities ai WHERE ai.user_id=local_auth_enrollments.user_id) AND (id='bootstrap' AND NOT EXISTS (SELECT 1 FROM instance_metadata) OR kind='operator' AND EXISTS (SELECT 1 FROM church_memberships om JOIN membership_roles mr ON mr.church_id=om.church_id AND mr.membership_id=om.id JOIN role_permissions rp ON rp.role_id=mr.role_id WHERE om.user_id=local_auth_enrollments.user_id AND om.church_id=local_auth_enrollments.church_id AND om.status='active' AND rp.permission='*' AND EXISTS (SELECT 1 FROM instance_metadata im WHERE im.primary_church_id=om.church_id)) OR kind='invite' AND ${issuerAuthority} AND EXISTS (SELECT 1 FROM church_memberships tm JOIN instance_metadata im ON im.primary_church_id=tm.church_id WHERE tm.church_id=local_auth_enrollments.church_id AND tm.user_id=local_auth_enrollments.user_id AND tm.status='active'))`

signInRoutes.use('*', async (c, next) => {
  if (c.req.method === 'GET' && c.req.path.endsWith('/status')) return next()
  const origin = signInOrigin(c.env)
  if (new URL(c.req.url).origin !== origin.origin)
    throw new AppError(403, 'wrong_origin', 'Use the church sign-in address.')
  if (c.req.method !== 'GET' && c.req.header('Origin') !== origin.origin)
    throw new AppError(403, 'wrong_origin', 'Reload this page and try again.')
  if (c.req.method !== 'GET') {
    const allowed = await c.env.AUTH_RATE_LIMIT.limit({
      key: `${origin.hostname}:${c.req.header('cf-connecting-ip') ?? 'local'}`,
    })
    if (!allowed.success)
      throw new AppError(
        429,
        'sign_in_rate_limited',
        'Please wait a minute and try again.',
      )
  }
  c.header('Cache-Control', 'private, no-store')
  c.header('Referrer-Policy', 'no-referrer')
  await next()
})

signInRoutes.get('/status', (c) =>
  c.json({
    local: Boolean(c.env.SIGN_IN_ORIGIN),
    access: Boolean(c.env.ACCESS_TEAM_DOMAIN && c.env.ACCESS_AUD),
  }),
)

async function makeChallenge(
  db: D1Database,
  challenge: string,
  kind: 'register' | 'authenticate',
  enrollmentId: string | null = null,
  userId: string | null = null,
) {
  const value = token()
  await db
    .prepare(
      'INSERT INTO local_auth_challenges (token_hash,challenge,kind,enrollment_id,user_id,expires_at) VALUES (?,?,?,?,?,?)',
    )
    .bind(
      await digest(value),
      challenge,
      kind,
      enrollmentId,
      userId,
      Date.now() + CHALLENGE_SECONDS * 1000,
    )
    .run()
  return value
}
async function consumeChallenge(
  db: D1Database,
  request: Request,
  origin: URL,
  kind: string,
) {
  const value = readCookie(request, cookieName(origin, 'challenge'))
  if (!value || !capability.safeParse(value).success) throw invalid()
  // Burn before verification, including failed attempts. A replay can never mint a session.
  const row = await db
    .prepare(
      'DELETE FROM local_auth_challenges WHERE token_hash=? AND kind=? AND expires_at>? RETURNING challenge,enrollment_id,user_id',
    )
    .bind(await digest(value), kind, Date.now())
    .first<{
      challenge: string
      enrollment_id: string | null
      user_id: string | null
    }>()
  if (!row) throw invalid()
  return row
}

signInRoutes.post('/enroll/start', async (c) => {
  const input = startSchema.safeParse(await jsonBody(c))
  if (!input.success) throw validationError(input.error)
  const origin = signInOrigin(c.env)
  const hash = await digest(input.data.token)
  if (input.data.bootstrap) {
    const secret = c.env.BOOTSTRAP_ENROLLMENT_TOKEN
    const email = c.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase()
    if (
      !secret ||
      !capability.safeParse(secret).success ||
      !email ||
      hash !== (await digest(secret))
    )
      throw invalid()
    // Only a fresh installation can prepare the first owner's credential.
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users (id,email,first_name,last_name,status,created_at,updated_at) SELECT ?,?,'Church','Owner','invited',?,? WHERE NOT EXISTS (SELECT 1 FROM instance_metadata) ON CONFLICT(email) DO NOTHING`,
      ).bind(crypto.randomUUID(), email, Date.now(), Date.now()),
      c.env.DB.prepare(
        `INSERT INTO local_auth_enrollments (id,kind,token_hash,user_id,expires_at) SELECT 'bootstrap','bootstrap',?,u.id,? FROM users u WHERE u.email=? COLLATE NOCASE AND u.status='invited' AND NOT EXISTS (SELECT 1 FROM instance_metadata) AND NOT EXISTS (SELECT 1 FROM auth_identities ai WHERE ai.user_id=u.id) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at WHERE local_auth_enrollments.consumed_by IS NULL`,
      ).bind(hash, Date.now() + 10 * 60 * 1000, email),
    ])
  }
  const grant = await c.env.DB.prepare(
    `SELECT id,user_id FROM local_auth_enrollments WHERE token_hash=? AND consumed_by IS NULL AND expires_at>? AND ${enrollmentEligibility}`,
  )
    .bind(hash, Date.now())
    .first<{ id: string; user_id: string }>()
  if (!grant) throw invalid()
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id=?')
    .bind(grant.user_id)
    .first<{ email: string }>()
  if (!user) throw invalid()
  const options = await generateRegistrationOptions({
    rpName: 'Fellowship42',
    rpID: origin.hostname,
    userID: new TextEncoder().encode(grant.user_id),
    userName: user.email,
    attestationType: 'none',
    supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  })
  const challengeCookie = await makeChallenge(
    c.env.DB,
    options.challenge,
    'register',
    grant.id,
    grant.user_id,
  )
  c.header(
    'Set-Cookie',
    cookie(origin, 'challenge', challengeCookie, CHALLENGE_SECONDS),
  )
  return c.json(options)
})

signInRoutes.post('/enroll/finish', async (c) => {
  const origin = signInOrigin(c.env)
  const challenge = await consumeChallenge(
    c.env.DB,
    c.req.raw,
    origin,
    'register',
  )
  if (!challenge.enrollment_id || !challenge.user_id) throw invalid()
  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: (await jsonBody(c)) as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin.origin,
      expectedRPID: origin.hostname,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    })
  } catch {
    throw invalid()
  }
  if (!verification.verified || !verification.registrationInfo) throw invalid()
  const credential = verification.registrationInfo.credential
  const operation = crypto.randomUUID(),
    now = Date.now(),
    session = token()
  const gate =
    'EXISTS (SELECT 1 FROM local_auth_enrollments WHERE id=? AND consumed_by=?)'
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE local_auth_enrollments SET consumed_by=? WHERE id=? AND user_id=? AND expires_at>? AND consumed_by IS NULL AND ${enrollmentEligibility}`,
    ).bind(operation, challenge.enrollment_id, challenge.user_id, now),
    c.env.DB.prepare(
      `INSERT INTO local_auth_passkeys (id,user_id,public_key,counter,created_at) SELECT ?,?,?,?,? WHERE ${gate}`,
    ).bind(
      credential.id,
      challenge.user_id,
      btoa(String.fromCharCode(...credential.publicKey)),
      credential.counter,
      now,
      challenge.enrollment_id,
      operation,
    ),
    c.env.DB.prepare(
      `INSERT INTO auth_identities (id,user_id,provider,subject,email_at_provider,created_at,updated_at) SELECT ?,u.id,'passkey',u.id,u.email,?,? FROM users u WHERE u.id=? AND ${gate}`,
    ).bind(
      crypto.randomUUID(),
      now,
      now,
      challenge.user_id,
      challenge.enrollment_id,
      operation,
    ),
    c.env.DB.prepare(
      `UPDATE users SET status='active',updated_at=? WHERE id=? AND ${gate}`,
    ).bind(now, challenge.user_id, challenge.enrollment_id, operation),
    c.env.DB.prepare(
      `INSERT INTO local_auth_sessions (token_hash,user_id,expires_at) SELECT ?,?,? WHERE ${gate}`,
    ).bind(
      await digest(session),
      challenge.user_id,
      now + SESSION_SECONDS * 1000,
      challenge.enrollment_id,
      operation,
    ),
    c.env.DB.prepare(
      `INSERT INTO audit_events (id,church_id,actor_user_id,action,entity_type,entity_id,request_id,occurred_at) SELECT ?,church_id,user_id,'auth.passkey_enrolled','user',user_id,?,? FROM local_auth_enrollments WHERE id=? AND consumed_by=? AND church_id IS NOT NULL`,
    ).bind(
      crypto.randomUUID(),
      c.get('requestId'),
      now,
      challenge.enrollment_id,
      operation,
    ),
  ])
  if (result[0].meta.changes !== 1) throw invalid()
  c.header('Set-Cookie', cookie(origin, 'session', session, SESSION_SECONDS))
  c.header('Set-Cookie', cookie(origin, 'challenge', '', 0), { append: true })
  return c.json({ ok: true })
})

signInRoutes.post('/start', async (c) => {
  const origin = signInOrigin(c.env)
  const options = await generateAuthenticationOptions({
    rpID: origin.hostname,
    userVerification: 'required',
  })
  const value = await makeChallenge(c.env.DB, options.challenge, 'authenticate')
  c.header('Set-Cookie', cookie(origin, 'challenge', value, CHALLENGE_SECONDS))
  return c.json(options)
})
signInRoutes.post('/finish', async (c) => {
  const origin = signInOrigin(c.env)
  const challenge = await consumeChallenge(
    c.env.DB,
    c.req.raw,
    origin,
    'authenticate',
  )
  const response = (await jsonBody(c)) as AuthenticationResponseJSON
  if (typeof response?.id !== 'string' || response.id.length > 2048)
    throw invalid()
  const stored = await c.env.DB.prepare(
    `SELECT p.id,p.user_id,p.public_key,p.counter FROM local_auth_passkeys p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.status='active'`,
  )
    .bind(response.id)
    .first<{
      id: string
      user_id: string
      public_key: string
      counter: number
    }>()
  if (!stored) throw invalid()
  // Discoverable credentials must report the opaque user handle we enrolled.
  if (
    response.response?.userHandle !==
    btoa(stored.user_id)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
  )
    throw invalid()
  let verified
  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin.origin,
      expectedRPID: origin.hostname,
      requireUserVerification: true,
      credential: {
        id: stored.id,
        publicKey: Uint8Array.from(atob(stored.public_key), (v) =>
          v.charCodeAt(0),
        ),
        counter: stored.counter,
      },
    })
  } catch {
    throw invalid()
  }
  if (!verified.verified) throw invalid()
  const session = token(),
    sessionHash = await digest(session),
    now = Date.now()
  // A fresh counter and current account status are checked in the same batch.
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO local_auth_sessions (token_hash,user_id,expires_at) SELECT ?,p.user_id,? FROM local_auth_passkeys p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.counter=? AND u.status='active'`,
    ).bind(
      sessionHash,
      now + SESSION_SECONDS * 1000,
      stored.id,
      stored.counter,
    ),
    c.env.DB.prepare(
      'UPDATE local_auth_passkeys SET counter=? WHERE id=? AND EXISTS (SELECT 1 FROM local_auth_sessions WHERE token_hash=?)',
    ).bind(verified.authenticationInfo.newCounter, stored.id, sessionHash),
  ])
  if (result[0].meta.changes !== 1) throw invalid()
  c.header('Set-Cookie', cookie(origin, 'session', session, SESSION_SECONDS))
  c.header('Set-Cookie', cookie(origin, 'challenge', '', 0), { append: true })
  return c.json({ ok: true })
})
signInRoutes.post('/logout', async (c) => {
  const origin = signInOrigin(c.env)
  const value = readCookie(c.req.raw, cookieName(origin, 'session'))
  if (value)
    await c.env.DB.prepare('DELETE FROM local_auth_sessions WHERE token_hash=?')
      .bind(await digest(value))
      .run()
  c.header('Set-Cookie', cookie(origin, 'session', '', 0))
  return c.json({ ok: true })
})

signInRoutes.post('/invitations/:churchId/:membershipId', async (c) => {
  const { churchId, membershipId } = c.req.param()
  // Issuing a credential is account authority, restricted to owners, not team managers.
  const user = await requirePermission(c, churchId, '*')
  const versionSchema = z
    .object({ version: z.number().int().positive() })
    .strict()
  const input = versionSchema.safeParse(await jsonBody(c))
  if (!input.success) throw validationError(input.error)
  const value = token(),
    hash = await digest(value),
    id = crypto.randomUUID(),
    now = Date.now()
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO local_auth_enrollments (id,token_hash,user_id,church_id,issuer_user_id,expires_at) SELECT ?,?,u.id,cm.church_id,?,? FROM users u JOIN church_memberships cm ON cm.user_id=u.id JOIN instance_metadata im ON im.primary_church_id=cm.church_id WHERE cm.church_id=? AND cm.id=? AND cm.version=? AND cm.status='active' AND u.status='invited' AND NOT EXISTS (SELECT 1 FROM auth_identities ai WHERE ai.user_id=u.id) AND EXISTS (SELECT 1 FROM users iu JOIN church_memberships icm ON icm.user_id=iu.id JOIN membership_roles mr ON mr.church_id=icm.church_id AND mr.membership_id=icm.id JOIN role_permissions rp ON rp.role_id=mr.role_id WHERE iu.id=? AND iu.status='active' AND icm.church_id=cm.church_id AND icm.status='active' AND rp.permission='*') ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,token_hash=excluded.token_hash,church_id=excluded.church_id,issuer_user_id=excluded.issuer_user_id,expires_at=excluded.expires_at,consumed_by=NULL`,
    ).bind(
      id,
      hash,
      user.id,
      now + 24 * 60 * 60 * 1000,
      churchId,
      membershipId,
      input.data.version,
      user.id,
    ),
    c.env.DB.prepare(
      `INSERT INTO audit_events (id,church_id,actor_user_id,action,entity_type,entity_id,request_id,occurred_at) SELECT ?,church_id,?,'auth.enrollment_issued','user',user_id,?,? FROM local_auth_enrollments WHERE id=? AND token_hash=?`,
    ).bind(crypto.randomUUID(), user.id, c.get('requestId'), now, id, hash),
  ])
  if (result[0].meta.changes !== 1)
    throw new AppError(
      409,
      'enrollment_unavailable',
      'Reload the team. Enrollment is available only for an invited account.',
    )
  return c.json({
    url: `${signInOrigin(c.env).origin}/sign-in#enroll=${value}`,
    expiresAt: now + 24 * 60 * 60 * 1000,
  })
})
