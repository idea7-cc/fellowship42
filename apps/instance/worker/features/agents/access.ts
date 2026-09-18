import { z } from 'zod'
import { agentScopeSchema, type AgentScope } from '../../../contracts/agents'
import { AppError } from '../../lib/errors'
import { membershipPermissionGate } from '../../lib/permission-gate'
import { requireCurrentUser, requirePermission } from '../../lib/auth'
import type { ContentContext } from '../../lib/content'

export function agentPermissions(scopes: AgentScope[]) {
  return [
    ...new Set(
      scopes.map((s) =>
        s.startsWith('events:')
          ? ('events.write' as const)
          : ('church.write' as const),
      ),
    ),
  ]
}
export function agentPermissionGate(
  churchColumn: string,
  scopes: AgentScope[],
) {
  return agentPermissions(scopes)
    .map((p) => membershipPermissionGate(churchColumn, p))
    .join(' AND ')
}
export async function requireScopePermissions(
  c: ContentContext,
  churchId: string,
  scopes: AgentScope[],
) {
  const user = await requireCurrentUser(c)
  for (const permission of agentPermissions(scopes))
    await requirePermission(c, churchId, permission)
  return user
}

export const agentPropsSchema = z
  .object({
    connectionId: z.string().uuid(),
    churchId: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    clientId: z.string().min(1).max(2048),
    scopes: z.array(agentScopeSchema).min(1).max(5),
  })
  .strict()
export type AgentProps = z.infer<typeof agentPropsSchema>

export async function requireAgentAccess(
  db: D1Database,
  props: AgentProps,
  scope?: AgentScope,
) {
  if (scope && !props.scopes.includes(scope))
    throw new AppError(
      403,
      'insufficient_scope',
      'This connection does not allow that action.',
    )
  const row = await db
    .prepare(
      `SELECT ac.scopes_json FROM agent_connections ac
    WHERE ac.id = ? AND ac.church_id = ? AND ac.user_id = ? AND ac.client_id = ?
      AND ac.revoked_at IS NULL AND ac.expires_at > ?
      AND EXISTS (SELECT 1 FROM instance_metadata i JOIN churches c ON c.id = i.primary_church_id
        WHERE i.singleton = 1 AND c.id = ac.church_id AND c.deleted_at IS NULL)
      AND ${agentPermissionGate('ac.church_id', props.scopes)}`,
    )
    .bind(
      props.connectionId,
      props.churchId,
      props.userId,
      props.clientId,
      Date.now(),
      ...agentPermissions(props.scopes).map(() => props.userId),
    )
    .first<{ scopes_json: string }>()
  if (
    !row ||
    props.scopes.some(
      (item) => !(JSON.parse(row.scopes_json) as string[]).includes(item),
    )
  )
    throw new AppError(
      403,
      'agent_access_revoked',
      'This connection is no longer authorized.',
    )
}
