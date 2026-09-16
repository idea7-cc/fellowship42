import { AppError } from '../../lib/errors'
import type { TeamMember, TeamResponse, TeamRole } from '../../../contracts/api'

export type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../../lib/auth').AccessIdentity | null
    requestId: string
  }
}

/** Manage who can sign in and what they may do. Owners hold `*`. */
export const TEAM_PERMISSION = 'team.manage'
export const OWNER_ROLE_KEY = 'owner'

export interface TeamMemberRow {
  membership_id: string
  user_id: string
  email: string
  first_name: string
  last_name: string
  account_status: 'invited' | 'active' | 'suspended'
  membership_status: 'invited' | 'active' | 'suspended' | 'left'
  joined_at: number | null
  last_seen_at: number | null
  role_keys: string | null
  version: number
}

interface TeamRoleRow {
  id: string
  key: string
  name: string
  description: string
  is_system: number
  permissions: string | null
}

const memberSelect = `
  SELECT cm.id AS membership_id, cm.user_id, u.email, u.first_name, u.last_name,
         u.status AS account_status, cm.status AS membership_status,
         cm.joined_at, u.last_seen_at, cm.version,
         (
           SELECT group_concat(key, ',') FROM (
             SELECT r.key FROM membership_roles mr
             JOIN roles r ON r.church_id = mr.church_id AND r.id = mr.role_id
             WHERE mr.church_id = cm.church_id AND mr.membership_id = cm.id
             ORDER BY r.key
           )
         ) AS role_keys
  FROM church_memberships cm
  JOIN users u ON u.id = cm.user_id
`

export function splitKeys(value: string | null): string[] {
  return value ? value.split(',').filter((key) => key.length > 0) : []
}

export function mapTeamMember(row: TeamMemberRow): TeamMember {
  return {
    membershipId: row.membership_id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    accountStatus: row.account_status,
    // Only `active` and `suspended` memberships are read; `invited` is a
    // legacy value that behaves as active because sign-in activates the account.
    membershipStatus:
      row.membership_status === 'suspended' ? 'suspended' : 'active',
    roleKeys: splitKeys(row.role_keys),
    joinedAt: row.joined_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    version: row.version,
  }
}

export async function findTeamMember(
  db: D1Database,
  churchId: string,
  membershipId: string,
): Promise<TeamMemberRow> {
  const row = await db
    .prepare(
      `${memberSelect} WHERE cm.church_id = ? AND cm.id = ? AND cm.status <> 'left'`,
    )
    .bind(churchId, membershipId)
    .first<TeamMemberRow>()
  if (!row) {
    throw new AppError(404, 'team_member_not_found', 'Team member not found')
  }
  return row
}

export async function findTeamMemberByOperation(
  db: D1Database,
  churchId: string,
  operationId: string,
): Promise<TeamMemberRow | null> {
  return db
    .prepare(
      `${memberSelect} WHERE cm.church_id = ? AND cm.last_operation_id = ?`,
    )
    .bind(churchId, operationId)
    .first<TeamMemberRow>()
}

export async function readTeamRoles(
  db: D1Database,
  churchId: string,
): Promise<Array<TeamRole & { id: string }>> {
  const rows = await db
    .prepare(
      `
        SELECT r.id, r.key, r.name, r.description, r.is_system,
               (
                 SELECT group_concat(permission, ',') FROM (
                   SELECT rp.permission FROM role_permissions rp
                   WHERE rp.role_id = r.id ORDER BY rp.permission
                 )
               ) AS permissions
        FROM roles r
        WHERE r.church_id = ?
        ORDER BY r.is_system DESC, r.key
      `,
    )
    .bind(churchId)
    .all<TeamRoleRow>()
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    permissions: splitKeys(row.permissions),
    isSystem: row.is_system === 1,
  }))
}

export async function readTeam(
  db: D1Database,
  churchId: string,
): Promise<TeamResponse> {
  const [members, roles] = await Promise.all([
    db
      .prepare(
        `${memberSelect}
         WHERE cm.church_id = ? AND cm.status <> 'left'
         ORDER BY CASE cm.status WHEN 'suspended' THEN 1 ELSE 0 END,
                  u.last_name COLLATE NOCASE, u.first_name COLLATE NOCASE, u.email`,
      )
      .bind(churchId)
      .all<TeamMemberRow>(),
    readTeamRoles(db, churchId),
  ])
  return {
    members: (members.results ?? []).map(mapTeamMember),
    roles: roles.map(({ id: _id, ...role }) => role),
  }
}

/**
 * Resolves role keys to role IDs for this church. Unknown keys are a client
 * error, not a silent drop: a partial grant would be worse than no grant.
 */
export async function resolveRoleIds(
  db: D1Database,
  churchId: string,
  roleKeys: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(roleKeys)]
  const roles = await readTeamRoles(db, churchId)
  const byKey = new Map(roles.map((role) => [role.key, role.id]))
  const unknown = unique.filter((key) => !byKey.has(key))
  if (unknown.length > 0) {
    throw new AppError(
      422,
      'invalid_role',
      `Unknown role${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
    )
  }
  return new Map(unique.map((key) => [key, byKey.get(key)!]))
}

/**
 * SQL fragment that blocks a change which would leave the church without an
 * active owner. Bind `1` as `removesOwner` when the change strips this
 * membership of an active owner role, `0` otherwise, followed by churchId and
 * the membership being changed.
 */
export const otherActiveOwnerGuard = `
  (? = 0 OR EXISTS (
    SELECT 1 FROM church_memberships other
    JOIN membership_roles mr ON mr.church_id = other.church_id AND mr.membership_id = other.id
    JOIN roles r ON r.church_id = mr.church_id AND r.id = mr.role_id
    WHERE other.church_id = ? AND other.status = 'active' AND other.id <> ?
      AND r.key = '${OWNER_ROLE_KEY}'
  ))
`

/** Audit and outbox rows conditioned on the membership operation winning. */
export function teamMutationEvidence(
  db: D1Database,
  input: {
    churchId: string
    actorId: string
    requestId: string
    membershipId: string
    eventName: string
    operationId: string
    now: number
    metadata: Record<string, unknown>
  },
) {
  const condition = `
    WHERE EXISTS (
      SELECT 1 FROM church_memberships
      WHERE church_id = ? AND id = ? AND last_operation_id = ?
    )
  `
  return [
    db
      .prepare(
        `
          INSERT INTO audit_events (
            id, church_id, actor_user_id, action, entity_type, entity_id,
            request_id, metadata_json, occurred_at
          )
          SELECT ?, ?, ?, ?, 'membership', ?, ?, ?, ?
          ${condition}
        `,
      )
      .bind(
        crypto.randomUUID(),
        input.churchId,
        input.actorId,
        input.eventName,
        input.membershipId,
        input.requestId,
        JSON.stringify(input.metadata),
        input.now,
        input.churchId,
        input.membershipId,
        input.operationId,
      ),
    db
      .prepare(
        `
          INSERT INTO outbox_events (
            id, church_id, topic, aggregate_type, aggregate_id, payload_json,
            status, available_at, created_at
          )
          SELECT ?, ?, ?, 'membership', ?, ?, 'pending', ?, ?
          ${condition}
        `,
      )
      .bind(
        crypto.randomUUID(),
        input.churchId,
        input.eventName,
        input.membershipId,
        JSON.stringify({ membershipId: input.membershipId }),
        input.now,
        input.now,
        input.churchId,
        input.membershipId,
        input.operationId,
      ),
  ]
}
