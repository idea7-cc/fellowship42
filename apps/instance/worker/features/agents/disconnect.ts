import { agentPropsSchema } from './access'
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { AppError } from '../../lib/errors'

// The provider validates/decrypts the opaque access token. Never infer authority
// from a token's text, a caller-supplied connection ID, or a refresh-token shape.
export async function disconnectAgent(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  api: OAuthHelpers,
) {
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  const authorization = request.headers.get('Authorization')
  const bearer = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1]
  const token =
    bearer && bearer.length <= 8192 ? await api.unwrapToken(bearer) : null
  const props = agentPropsSchema.safeParse(token?.grant.props)
  if (
    !token ||
    !props.success ||
    token.audience !== `${env.MCP_ORIGIN}/mcp` ||
    token.userId !== props.data.userId ||
    token.grant.clientId !== props.data.clientId
  )
    return new Response(null, {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
    })
  const p = props.data
  const row = await env.DB.prepare(
    'SELECT revoked_at FROM agent_connections WHERE id=? AND church_id=? AND user_id=? AND client_id=? AND provider_grant_id=?',
  )
    .bind(p.connectionId, p.churchId, p.userId, p.clientId, token.grantId)
    .first<{ revoked_at: number | null }>()
  if (!row)
    throw new AppError(404, 'connection_not_found', 'Connection not found.')
  if (row.revoked_at === null) {
    const now = Date.now(),
      requestId = crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE agent_connections SET revoked_at=? WHERE id=? AND church_id=? AND user_id=? AND client_id=? AND provider_grant_id=? AND revoked_at IS NULL',
      ).bind(
        now,
        p.connectionId,
        p.churchId,
        p.userId,
        p.clientId,
        token.grantId,
      ),
      env.DB.prepare(
        `INSERT INTO audit_events(id,church_id,actor_user_id,action,entity_type,entity_id,request_id,metadata_json,occurred_at) SELECT ?,?,?,'agent.revoked','agent_connection',?,?,?,? WHERE changes()=1`,
      ).bind(
        crypto.randomUUID(),
        p.churchId,
        p.userId,
        p.connectionId,
        requestId,
        JSON.stringify({ initiator: 'client', clientId: p.clientId }),
        now,
      ),
    ])
  }
  ctx.waitUntil(api.revokeGrant(token.grantId, p.userId).catch(() => {}))
  return Response.json({ revoked: true })
}
