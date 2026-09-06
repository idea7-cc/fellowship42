import { AppError } from '../../lib/errors'
import type { GroupRow } from '../../lib/records'

export type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../../lib/auth').AccessIdentity | null
    requestId: string
  }
}

export const groupSelect = `
  SELECT id, church_id, ministry_id, slug, title, status, group_type, audience,
         schedule, location, enrollment_policy, capacity, featured, summary, version
  FROM groups
`

export async function findGroup(
  db: D1Database,
  churchId: string,
  groupId: string,
) {
  const row = await db
    .prepare(
      `${groupSelect} WHERE church_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(churchId, groupId)
    .first<GroupRow>()
  if (!row) throw new AppError(404, 'group_not_found', 'Group not found')
  return row
}

/** Stamps the group so `mutationEvidence` can attach audit and outbox rows. */
export function touchGroup(
  db: D1Database,
  churchId: string,
  groupId: string,
  now: number,
  operationId: string,
  condition = '1 = 1',
  bindings: (string | number | null)[] = [],
) {
  return db
    .prepare(
      `
        UPDATE groups SET updated_at = ?, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND (${condition})
      `,
    )
    .bind(now, operationId, churchId, groupId, ...bindings)
}

export function requireParticipationChange(results: D1Result[]) {
  if (results[0]?.meta.changes !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The record or group availability changed. Refresh before trying again.',
    )
  }
}
