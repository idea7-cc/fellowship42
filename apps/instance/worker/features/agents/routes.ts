import { Hono } from 'hono'
import { z } from 'zod'
import {
  AuthorizationError,
  CimdFetchError,
} from '@cloudflare/workers-oauth-provider'
import {
  agentScopeSchema,
  type AgentConsent,
  type AgentConnections,
} from '../../../contracts/agents'
import {
  requireCurrentUser,
  requireChurchMembership,
  type AccessIdentity,
} from '../../lib/auth'
import { AppError } from '../../lib/errors'
import { jsonBody, validationError } from '../../lib/content'
import {
  agentPermissions,
  agentPermissionGate,
  requireScopePermissions,
} from './access'
import { agentOAuth, agentOrigin } from './oauth'

type AppEnv = {
  Bindings: Env
  Variables: { identity: AccessIdentity | null; requestId: string }
}
export const agentRoutes = new Hono<AppEnv>()
const scopesSchema = z.array(agentScopeSchema).min(1).max(5)

async function parseRequest(env: Env, url: string) {
  try {
    const request = await agentOAuth(env).parseAuthRequest(new Request(url))
    const scopes = scopesSchema.safeParse(request.scope)
    if (
      !scopes.success ||
      (request.scope.includes('draft:write') &&
        !request.scope.includes('draft:read')) ||
      (request.scope.includes('events:write') &&
        !request.scope.includes('events:read'))
    )
      throw new AppError(
        400,
        'invalid_scope',
        'Request valid scopes; writing drafts also requires the matching read scope.',
      )
    if (
      request.codeChallengeMethod !== 'S256' ||
      !request.codeChallenge ||
      !/^[A-Za-z0-9_-]{43}$/.test(request.codeChallenge)
    )
      throw new AppError(
        400,
        'pkce_required',
        'An S256 PKCE challenge is required.',
      )
    return { request, scopes: scopes.data }
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CimdFetchError)
      throw new AppError(
        400,
        'invalid_authorization_request',
        'The agent connection request is invalid or unavailable.',
      )
    throw error
  }
}

agentRoutes.get('/consent', async (c) => {
  const instance = await c.env.DB.prepare(
    `SELECT c.id, c.name FROM instance_metadata i JOIN churches c ON c.id = i.primary_church_id WHERE i.singleton = 1 AND c.deleted_at IS NULL`,
  ).first<{ id: string; name: string }>()
  if (!instance)
    throw new AppError(404, 'instance_not_found', 'Set up this church first.')
  const origin = agentOrigin(c.env)
  if (!origin)
    throw new AppError(
      503,
      'agents_not_configured',
      'Agent connections are not configured.',
    )
  const url = `${origin}/oauth/authorize${new URL(c.req.url).search}`
  if (url.length > 8192)
    throw new AppError(
      400,
      'invalid_authorization_request',
      'The agent request is too long.',
    )
  const { request, scopes } = await parseRequest(c.env, url)
  const user = await requireScopePermissions(c, instance.id, scopes)
  const client = await agentOAuth(c.env).lookupClient(request.clientId)
  if (!client)
    throw new AppError(400, 'invalid_client', 'The agent is unavailable.')
  const clientName = (
    client.clientName || new URL(request.redirectUri).hostname
  ).slice(0, 100)
  const now = Date.now()
  await c.env.DB.prepare(
    'DELETE FROM agent_consent_requests WHERE expires_at <= ?',
  )
    .bind(now)
    .run()
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) AS total FROM agent_consent_requests WHERE user_id = ?',
  )
    .bind(user.id)
    .first<{ total: number }>()
  if ((count?.total ?? 0) >= 20)
    throw new AppError(
      429,
      'too_many_requests',
      'Please wait before connecting again.',
    )
  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO agent_consent_requests (id,church_id,user_id,request_url,client_name,expires_at) VALUES (?,?,?,?,?,?)`,
  )
    .bind(id, instance.id, user.id, url, clientName, now + 10 * 60 * 1000)
    .run()
  return c.json({
    requestId: id,
    churchName: instance.name,
    clientName,
    clientId: request.clientId,
    redirectOrigin: new URL(request.redirectUri).origin,
    scopes,
  } satisfies AgentConsent)
})

agentRoutes.post('/consent', async (c) => {
  if (c.req.header('Origin') !== agentOrigin(c.env))
    throw new AppError(
      403,
      'origin_denied',
      'Open this request in the church app.',
    )
  const input = z
    .object({
      requestId: z.string().uuid(),
      decision: z.enum(['allow', 'deny']),
    })
    .strict()
    .safeParse(await jsonBody(c))
  if (!input.success) throw validationError(input.error)
  const user = await requireCurrentUser(c)
  const pending = await c.env.DB.prepare(
    `SELECT * FROM agent_consent_requests WHERE id = ? AND user_id = ? AND expires_at > ?`,
  )
    .bind(input.data.requestId, user.id, Date.now())
    .first<{ church_id: string; request_url: string; client_name: string }>()
  if (!pending)
    throw new AppError(
      410,
      'consent_expired',
      'This request expired. Connect again from your agent.',
    )
  const { request, scopes } = await parseRequest(c.env, pending.request_url)
  await requireScopePermissions(c, pending.church_id, scopes)
  const consumed = await c.env.DB.prepare(
    'DELETE FROM agent_consent_requests WHERE id = ? AND user_id = ? AND expires_at > ? RETURNING id',
  )
    .bind(input.data.requestId, user.id, Date.now())
    .first()
  if (!consumed)
    throw new AppError(
      410,
      'consent_expired',
      'This request has already been handled.',
    )
  if (input.data.decision === 'deny') {
    const redirect = new URL(request.redirectUri)
    redirect.searchParams.set('error', 'access_denied')
    redirect.searchParams.set('state', request.state)
    if (request.issuer) redirect.searchParams.set('iss', request.issuer)
    return c.json({ redirectTo: redirect.toString() })
  }
  const id = crypto.randomUUID()
  const now = Date.now()
  const created = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO agent_connections (id,church_id,user_id,client_id,client_name,scopes_json,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,? WHERE ${agentPermissionGate('?', scopes)}
      AND (SELECT COUNT(*) FROM agent_connections WHERE church_id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ? AND client_id != ?) < 20`,
    ).bind(
      id,
      pending.church_id,
      user.id,
      request.clientId,
      pending.client_name,
      JSON.stringify(scopes),
      now,
      now + 30 * 24 * 60 * 60 * 1000,
      ...agentPermissions(scopes).flatMap(() => [pending.church_id, user.id]),
      pending.church_id,
      user.id,
      now,
      request.clientId,
    ),
    c.env.DB.prepare(
      `INSERT INTO audit_events (id,church_id,actor_user_id,action,entity_type,entity_id,request_id,metadata_json,occurred_at)
      SELECT ?,?,?,'agent.approved','agent_connection',?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_connections WHERE id = ?)`,
    ).bind(
      crypto.randomUUID(),
      pending.church_id,
      user.id,
      id,
      c.get('requestId'),
      JSON.stringify({ clientId: request.clientId, scopes }),
      now,
      id,
    ),
    c.env.DB.prepare(
      `INSERT INTO audit_events(id,church_id,actor_user_id,action,entity_type,entity_id,request_id,metadata_json,occurred_at)
      SELECT lower(hex(randomblob(16))),church_id,user_id,'agent.superseded','agent_connection',id,?,?,? FROM agent_connections WHERE church_id=? AND user_id=? AND client_id=? AND id!=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM agent_connections WHERE id=?)`,
    ).bind(
      c.get('requestId'),
      JSON.stringify({ replacementId: id }),
      now,
      pending.church_id,
      user.id,
      request.clientId,
      id,
      id,
    ),
    c.env.DB.prepare(
      `UPDATE agent_connections SET revoked_at=? WHERE church_id=? AND user_id=? AND client_id=? AND id!=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM agent_connections WHERE id=?)`,
    ).bind(now, pending.church_id, user.id, request.clientId, id, id),
  ])
  if (created[0].meta.changes !== 1) {
    await requireScopePermissions(c, pending.church_id, scopes)
    throw new AppError(
      422,
      'connection_limit',
      'Disconnect an agent before adding another.',
    )
  }
  try {
    const result = await agentOAuth(c.env).completeAuthorization({
      request,
      userId: user.id,
      metadata: { connectionId: id },
      scope: scopes,
      props: {
        connectionId: id,
        churchId: pending.church_id,
        userId: user.id,
        clientId: request.clientId,
        scopes,
      },
      revokeExistingGrants: true,
    })
    return c.json(result)
  } catch (error) {
    await c.env.DB.prepare(
      'UPDATE agent_connections SET revoked_at = ? WHERE id = ?',
    )
      .bind(Date.now(), id)
      .run()
    throw error
  }
})

agentRoutes.get('/:churchId', async (c) => {
  const user = await requireChurchMembership(c, c.req.param('churchId'))
  const rows = await c.env.DB.prepare(
    `SELECT id,client_name,client_id,scopes_json,created_at,expires_at,revoked_at FROM agent_connections WHERE church_id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 20`,
  )
    .bind(c.req.param('churchId'), user.id, Date.now())
    .all<{
      id: string
      client_name: string
      client_id: string
      scopes_json: string
      created_at: number
      expires_at: number
      revoked_at: number | null
    }>()
  const origin = agentOrigin(c.env)
  return c.json({
    endpoint: origin ? `${origin}/mcp` : null,
    connections: rows.results.map((row) => ({
      id: row.id,
      clientName: row.client_name,
      clientId: row.client_id,
      scopes: scopesSchema.parse(JSON.parse(row.scopes_json)),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    })),
  } satisfies AgentConnections)
})

agentRoutes.post('/:churchId/:connectionId/revoke', async (c) => {
  if (c.req.header('Origin') !== new URL(c.req.url).origin)
    throw new AppError(
      403,
      'origin_denied',
      'Open this request in the church app.',
    )
  const user = await requireCurrentUser(c)
  const churchId = c.req.param('churchId')
  const id = c.req.param('connectionId')
  // A user may revoke their own grants even after losing church membership.
  const row = await c.env.DB.prepare(
    'SELECT revoked_at, provider_grant_id FROM agent_connections WHERE id = ? AND church_id = ? AND user_id = ?',
  )
    .bind(id, churchId, user.id)
    .first<{ revoked_at: number | null; provider_grant_id: string | null }>()
  if (!row)
    throw new AppError(404, 'connection_not_found', 'Connection not found.')
  if (row.revoked_at === null) {
    const now = Date.now()
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE agent_connections SET revoked_at = ? WHERE id = ? AND church_id = ? AND user_id = ? AND revoked_at IS NULL',
      ).bind(now, id, churchId, user.id),
      c.env.DB.prepare(
        `INSERT INTO audit_events (id,church_id,actor_user_id,action,entity_type,entity_id,request_id,metadata_json,occurred_at)
        SELECT ?,?,?,'agent.revoked','agent_connection',?,?,'{}',? WHERE changes() = 1`,
      ).bind(
        crypto.randomUUID(),
        churchId,
        user.id,
        id,
        c.get('requestId'),
        now,
      ),
    ])
  }
  if (row.provider_grant_id && agentOrigin(c.env))
    c.executionCtx.waitUntil(
      agentOAuth(c.env)
        .revokeGrant(row.provider_grant_id, user.id)
        .catch(() => {}),
    )
  return c.json({ revoked: true })
})
