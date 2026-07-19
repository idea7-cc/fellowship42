import { Hono } from 'hono'
import { syncCurrentUser } from '../lib/auth'
import type { SessionResponse } from '../../src/lib/api-types'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

export const sessionRoutes = new Hono<AppEnv>()

sessionRoutes.get('/', async (c) => {
  const identity = c.get('identity')
  if (!identity) {
    return c.json<SessionResponse>({ user: null })
  }

  const user = await syncCurrentUser(c.env.DB, identity)
  const rows = await c.env.DB
    .prepare(`
      SELECT
        cm.church_id,
        c.name AS church_name,
        r.key AS role_key,
        rp.permission
      FROM church_memberships cm
      JOIN churches c ON c.id = cm.church_id
      LEFT JOIN membership_roles mr
        ON mr.church_id = cm.church_id AND mr.membership_id = cm.id
      LEFT JOIN roles r ON r.id = mr.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE cm.user_id = ? AND cm.status = 'active' AND c.deleted_at IS NULL
      ORDER BY c.name, r.key, rp.permission
    `)
    .bind(user.id)
    .all<{
      church_id: string
      church_name: string
      role_key: string | null
      permission: string | null
    }>()

  const byChurch = new Map<
    string,
    { churchId: string; churchName: string; permissions: Set<string>; roles: Set<string> }
  >()
  for (const row of rows.results) {
    const membership = byChurch.get(row.church_id) ?? {
      churchId: row.church_id,
      churchName: row.church_name,
      permissions: new Set<string>(),
      roles: new Set<string>(),
    }
    if (row.permission) membership.permissions.add(row.permission)
    if (row.role_key) membership.roles.add(row.role_key)
    byChurch.set(row.church_id, membership)
  }

  return c.json<SessionResponse>({
    user: {
      ...user,
      memberships: [...byChurch.values()].map((membership) => ({
        churchId: membership.churchId,
        churchName: membership.churchName,
        permissions: [...membership.permissions],
        roles: [...membership.roles],
      })),
    },
  })
})
