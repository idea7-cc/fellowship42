import { Hono } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../../lib/auth'
import { AppError } from '../../lib/errors'
import {
  broadcastContent,
  jsonBody,
  validationError,
  versionInputSchema,
} from '../../lib/content'
import type { TeamMemberResponse, TeamResponse } from '../../../contracts/api'
import {
  type AppEnv,
  OWNER_ROLE_KEY,
  TEAM_PERMISSION,
  findTeamMember,
  findTeamMemberByOperation,
  mapTeamMember,
  otherActiveOwnerGuard,
  readTeam,
  resolveRoleIds,
  splitKeys,
  teamMutationEvidence,
} from './shared'

export const teamMemberRoutes = new Hono<AppEnv>()

const roleKeysSchema = z
  .array(z.string().trim().min(1).max(64))
  .min(1, 'Choose at least one role')
  .max(20)
const inviteInput = z
  .object({
    email: z.email().max(254),
    firstName: z.string().trim().max(100).default(''),
    lastName: z.string().trim().max(100).default(''),
    roleKeys: roleKeysSchema,
  })
  .strict()
const updateInput = z
  .object({
    version: z.number().int().positive(),
    roleKeys: roleKeysSchema.optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .strict()
  .refine(
    (value) => value.roleKeys !== undefined || value.status !== undefined,
    {
      message: 'Provide roleKeys or status',
    },
  )

function roleAssignments(
  db: D1Database,
  churchId: string,
  operationId: string,
  roleIds: Iterable<string>,
  actorId: string,
  now: number,
) {
  // Membership is located by the operation token so the same statements serve
  // a brand-new membership and a reactivated one whose id was not known
  // before the batch ran.
  const located = `
    SELECT id FROM church_memberships WHERE church_id = ? AND last_operation_id = ?
  `
  return [
    db
      .prepare(
        `DELETE FROM membership_roles WHERE church_id = ? AND membership_id IN (${located})`,
      )
      .bind(churchId, churchId, operationId),
    ...[...roleIds].map((roleId) =>
      db
        .prepare(
          `
            INSERT INTO membership_roles (
              church_id, membership_id, role_id, assigned_at, assigned_by_user_id
            )
            SELECT ?, id, ?, ?, ? FROM church_memberships
            WHERE church_id = ? AND last_operation_id = ?
          `,
        )
        .bind(churchId, roleId, now, actorId, churchId, operationId),
    ),
  ]
}

teamMemberRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, TEAM_PERMISSION)
  return c.json<TeamResponse>(await readTeam(c.env.DB, churchId))
})

teamMemberRoutes.post('/:churchId/invitations', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, TEAM_PERMISSION)
  const parsed = inviteInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const email = parsed.data.email.toLowerCase()
  const roleIds = await resolveRoleIds(c.env.DB, churchId, parsed.data.roleKeys)

  const existing = await c.env.DB.prepare(
    `
      SELECT u.status AS account_status, cm.status AS membership_status
      FROM users u
      LEFT JOIN church_memberships cm ON cm.user_id = u.id AND cm.church_id = ?
      WHERE u.email = ? COLLATE NOCASE
    `,
  )
    .bind(churchId, email)
    .first<{
      account_status: 'invited' | 'active' | 'suspended'
      membership_status: 'invited' | 'active' | 'suspended' | 'left' | null
    }>()
  if (existing?.account_status === 'suspended') {
    throw new AppError(
      409,
      'account_suspended',
      'This sign-in account is suspended and cannot be invited',
    )
  }
  if (
    existing?.membership_status === 'active' ||
    existing?.membership_status === 'suspended'
  ) {
    throw new AppError(
      409,
      'team_member_exists',
      'This person is already on the team',
    )
  }

  const userId = `user_${crypto.randomUUID()}`
  const membershipId = `membership_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const roleKeys = [...roleIds.keys()]
  await c.env.DB.batch([
    // A person who has signed in before being invited already has an active
    // account; keep it. Otherwise the account waits as `invited` until the
    // first verified sign-in claims it (see syncCurrentUser).
    c.env.DB.prepare(
      `
        INSERT INTO users (
          id, email, first_name, last_name, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'invited', ?, ?)
        ON CONFLICT(email) DO NOTHING
      `,
    ).bind(
      userId,
      email,
      parsed.data.firstName,
      parsed.data.lastName,
      now,
      now,
    ),
    c.env.DB.prepare(
      `
        INSERT INTO church_memberships (
          id, church_id, user_id, status, joined_at, created_at, updated_at,
          version, last_operation_id
        )
        SELECT ?, ?, u.id, 'active', ?, ?, ?, 1, ?
        FROM users u WHERE u.email = ? COLLATE NOCASE
        ON CONFLICT(church_id, user_id) DO UPDATE SET
          status = 'active',
          joined_at = excluded.joined_at,
          updated_at = excluded.updated_at,
          version = church_memberships.version + 1,
          last_operation_id = excluded.last_operation_id
        WHERE church_memberships.status IN ('left', 'invited')
      `,
    ).bind(membershipId, churchId, now, now, now, operationId, email),
    ...roleAssignments(
      c.env.DB,
      churchId,
      operationId,
      roleIds.values(),
      actor.id,
      now,
    ),
    c.env.DB.prepare(
      `
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, metadata_json, occurred_at
        )
        SELECT ?, ?, ?, 'team.member.invited', 'membership', id, ?, ?, ?
        FROM church_memberships WHERE church_id = ? AND last_operation_id = ?
      `,
    ).bind(
      crypto.randomUUID(),
      churchId,
      actor.id,
      c.get('requestId'),
      JSON.stringify({ roleKeys }),
      now,
      churchId,
      operationId,
    ),
    c.env.DB.prepare(
      `
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        )
        SELECT ?, ?, 'team.member.invited', 'membership', id,
               json_object('membershipId', id), 'pending', ?, ?
        FROM church_memberships WHERE church_id = ? AND last_operation_id = ?
      `,
    ).bind(crypto.randomUUID(), churchId, now, now, churchId, operationId),
  ])

  const member = await findTeamMemberByOperation(
    c.env.DB,
    churchId,
    operationId,
  )
  if (!member) {
    // A concurrent invitation for the same email won the upsert.
    throw new AppError(
      409,
      'team_member_exists',
      'This person is already on the team',
    )
  }
  broadcastContent(c, churchId, 'membership', member.membership_id, 'created')
  return c.json<TeamMemberResponse>({ member: mapTeamMember(member) }, 201)
})

teamMemberRoutes.patch('/:churchId/:membershipId', async (c) => {
  const churchId = c.req.param('churchId')
  const membershipId = c.req.param('membershipId')
  const actor = await requirePermission(c, churchId, TEAM_PERMISSION)
  const parsed = updateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findTeamMember(c.env.DB, churchId, membershipId)
  const roleIds = parsed.data.roleKeys
    ? await resolveRoleIds(c.env.DB, churchId, parsed.data.roleKeys)
    : null

  const currentRoleKeys = splitKeys(current.role_keys)
  const nextStatus =
    parsed.data.status ?? mapTeamMember(current).membershipStatus
  const nextRoleKeys = roleIds ? [...roleIds.keys()] : currentRoleKeys
  const isActiveOwner =
    current.membership_status !== 'suspended' &&
    currentRoleKeys.includes(OWNER_ROLE_KEY)
  const removesOwner =
    isActiveOwner &&
    (nextStatus !== 'active' || !nextRoleKeys.includes(OWNER_ROLE_KEY))

  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE church_memberships SET
          status = ?, updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND status <> 'left' AND version = ?
          AND ${otherActiveOwnerGuard}
      `,
    ).bind(
      nextStatus,
      now,
      operationId,
      churchId,
      membershipId,
      parsed.data.version,
      removesOwner ? 1 : 0,
      churchId,
      membershipId,
    ),
    ...(roleIds
      ? roleAssignments(
          c.env.DB,
          churchId,
          operationId,
          roleIds.values(),
          actor.id,
          now,
        )
      : []),
    ...teamMutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      membershipId,
      eventName: 'team.member.updated',
      operationId,
      now,
      metadata: {
        previousVersion: parsed.data.version,
        status: nextStatus,
        roleKeys: nextRoleKeys,
      },
    }),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    await rejectFailedChange(
      c.env.DB,
      churchId,
      membershipId,
      parsed.data.version,
    )
  }

  broadcastContent(c, churchId, 'membership', membershipId, 'updated')
  return c.json<TeamMemberResponse>({
    member: mapTeamMember(
      await findTeamMember(c.env.DB, churchId, membershipId),
    ),
  })
})

teamMemberRoutes.delete('/:churchId/:membershipId', async (c) => {
  const churchId = c.req.param('churchId')
  const membershipId = c.req.param('membershipId')
  const actor = await requirePermission(c, churchId, TEAM_PERMISSION)
  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findTeamMember(c.env.DB, churchId, membershipId)
  const removesOwner =
    current.membership_status !== 'suspended' &&
    splitKeys(current.role_keys).includes(OWNER_ROLE_KEY)

  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE church_memberships SET
          status = 'left', updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND status <> 'left' AND version = ?
          AND ${otherActiveOwnerGuard}
      `,
    ).bind(
      now,
      operationId,
      churchId,
      membershipId,
      parsed.data.version,
      removesOwner ? 1 : 0,
      churchId,
      membershipId,
    ),
    c.env.DB.prepare(
      `
        DELETE FROM membership_roles WHERE church_id = ? AND membership_id = ?
          AND EXISTS (
            SELECT 1 FROM church_memberships
            WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
      `,
    ).bind(churchId, membershipId, churchId, membershipId, operationId),
    ...teamMutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      membershipId,
      eventName: 'team.member.removed',
      operationId,
      now,
      metadata: { previousVersion: parsed.data.version },
    }),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    await rejectFailedChange(
      c.env.DB,
      churchId,
      membershipId,
      parsed.data.version,
    )
  }

  broadcastContent(c, churchId, 'membership', membershipId, 'deleted')
  return c.body(null, 204)
})

/**
 * The guarded UPDATE changed nothing. Distinguish a stale version from the
 * last-owner guard so the editor knows whether to refresh or to add another
 * owner first.
 */
async function rejectFailedChange(
  db: D1Database,
  churchId: string,
  membershipId: string,
  observedVersion: number,
): Promise<never> {
  const row = await db
    .prepare(
      `SELECT version, status FROM church_memberships WHERE church_id = ? AND id = ?`,
    )
    .bind(churchId, membershipId)
    .first<{ version: number; status: string }>()
  if (!row || row.status === 'left' || row.version !== observedVersion) {
    throw new AppError(
      409,
      'version_conflict',
      'The team member changed after it was loaded. Refresh before trying again.',
    )
  }
  throw new AppError(
    409,
    'last_owner_required',
    'At least one active owner must remain. Give someone else the owner role first.',
  )
}
