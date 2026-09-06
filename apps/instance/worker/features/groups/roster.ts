import { Hono } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../../lib/auth'
import { AppError } from '../../lib/errors'
import {
  broadcastContent,
  jsonBody,
  mutationEvidence,
  validationError,
  versionInputSchema,
} from '../../lib/content'
import {
  type AppEnv,
  findGroup,
  touchGroup,
  requireParticipationChange,
} from './shared'
import {
  mapGroupMember,
  mapGroupLeader,
  type GroupMemberRow,
  type GroupLeaderRow,
} from '../../lib/records'

export const groupRosterRoutes = new Hono<AppEnv>()

const membershipStatusSchema = z.enum([
  'interested',
  'pending',
  'active',
  'paused',
  'completed',
])
const leaderRoleSchema = z.enum(['leader', 'apprentice', 'host'])

const memberUpsertInput = z
  .object({
    version: z.number().int().nonnegative().default(0),
    status: membershipStatusSchema.default('active'),
    notes: z.string().trim().max(4_000).nullable().default(null),
  })
  .strict()

const leaderUpsertInput = z
  .object({
    version: z.number().int().nonnegative().default(0),
    role: leaderRoleSchema.default('leader'),
  })
  .strict()

async function requirePerson(
  db: D1Database,
  churchId: string,
  personId: string,
) {
  const row = await db
    .prepare(
      'SELECT 1 AS present FROM people WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
    .bind(churchId, personId)
    .first<{ present: number }>()
  if (!row) {
    throw new AppError(
      422,
      'invalid_person',
      'The selected person does not exist in this church',
    )
  }
}

async function readRoster(
  db: D1Database,
  churchId: string,
  groupId: string,
  capacity: number | null,
) {
  const [members, leaders] = await Promise.all([
    db
      .prepare(
        `
          SELECT m.id, m.group_id, m.person_id, p.first_name, p.last_name, p.email,
                 m.status, m.joined_at, m.notes, m.version
          FROM group_memberships m
          JOIN people p ON p.church_id = m.church_id AND p.id = m.person_id
          WHERE m.church_id = ? AND m.group_id = ? AND p.deleted_at IS NULL
          ORDER BY p.sort_name
        `,
      )
      .bind(churchId, groupId)
      .all<GroupMemberRow>(),
    db
      .prepare(
        `
          SELECT l.group_id, l.person_id, p.first_name, p.last_name, p.email, l.role, l.version
          FROM group_leaders l
          JOIN people p ON p.church_id = l.church_id AND p.id = l.person_id
          WHERE l.church_id = ? AND l.group_id = ? AND p.deleted_at IS NULL
          ORDER BY p.sort_name
        `,
      )
      .bind(churchId, groupId)
      .all<GroupLeaderRow>(),
  ])
  const mapped = (members.results ?? []).map(mapGroupMember)
  return {
    members: mapped,
    leaders: (leaders.results ?? []).map(mapGroupLeader),
    activeCount: mapped.filter((member) => member.status === 'active').length,
    capacity: capacity ?? undefined,
  }
}

groupRosterRoutes.get('/:churchId/:groupId/roster', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  await requirePermission(c, churchId, 'groups.write')
  const group = await findGroup(c.env.DB, churchId, groupId)
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

groupRosterRoutes.put('/:churchId/:groupId/members/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const parsed = memberUpsertInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)

  const group = await findGroup(c.env.DB, churchId, groupId)
  await requirePerson(c.env.DB, churchId, personId)

  // Capacity is a real limit, enforced on the server. Counting only `active`
  // keeps waiting lists (`interested`, `pending`) usable past a full group.
  if (parsed.data.status === 'active' && group.capacity !== null) {
    const existing = await c.env.DB.prepare(
      `
          SELECT COUNT(*) AS total FROM group_memberships m
          JOIN people p ON p.church_id = m.church_id AND p.id = m.person_id
          WHERE m.church_id = ? AND m.group_id = ? AND m.status = 'active' AND m.person_id <> ?
            AND p.deleted_at IS NULL
        `,
    )
      .bind(churchId, groupId, personId)
      .first<{ total: number }>()
    if ((existing?.total ?? 0) >= group.capacity) {
      throw new AppError(
        409,
        'group_at_capacity',
        `This group is limited to ${group.capacity} active members`,
      )
    }
  }

  const membershipId = `groupmember_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    touchGroup(
      c.env.DB,
      churchId,
      groupId,
      now,
      operationId,
      `COALESCE((SELECT version FROM group_memberships WHERE church_id = ? AND group_id = ? AND person_id = ?), 0) = ? AND (EXISTS (SELECT 1 FROM people WHERE church_id = ? AND id = ? AND deleted_at IS NULL)
       AND (? <> 'active' OR capacity IS NULL OR capacity > (
         SELECT COUNT(*) FROM group_memberships m
         JOIN people p ON p.church_id = m.church_id AND p.id = m.person_id
         WHERE m.church_id = groups.church_id AND m.group_id = groups.id
           AND m.status = 'active' AND m.person_id <> ? AND p.deleted_at IS NULL)))`,
      [
        churchId,
        groupId,
        personId,
        parsed.data.version,
        churchId,
        personId,
        parsed.data.status,
        personId,
      ],
    ),
    c.env.DB.prepare(
      `
          INSERT INTO group_memberships (
            id, church_id, group_id, person_id, status, joined_at, notes,
            created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
          ON CONFLICT(group_id, person_id) DO UPDATE SET
            version = group_memberships.version + 1,
            status = excluded.status,
            notes = excluded.notes,
            joined_at = COALESCE(group_memberships.joined_at, excluded.joined_at),
            updated_at = excluded.updated_at
        `,
    ).bind(
      membershipId,
      churchId,
      groupId,
      personId,
      parsed.data.status,
      parsed.data.status === 'active' ? now : null,
      parsed.data.notes,
      now,
      now,
      churchId,
      groupId,
      operationId,
    ),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'group',
      entityId: groupId,
      eventName: 'groups.member.upserted',
      operationId,
      table: 'groups',
      now,
      metadata: { personId, status: parsed.data.status },
    }),
  ])
  requireParticipationChange(results)
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

groupRosterRoutes.delete('/:churchId/:groupId/members/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const group = await findGroup(c.env.DB, churchId, groupId)

  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    touchGroup(
      c.env.DB,
      churchId,
      groupId,
      now,
      operationId,
      `COALESCE((SELECT version FROM group_memberships WHERE church_id = ? AND group_id = ? AND person_id = ?), 0) = ? AND (1 = 1)`,
      [churchId, groupId, personId, parsed.data.version],
    ),
    c.env.DB.prepare(
      `DELETE FROM group_memberships WHERE church_id = ? AND group_id = ? AND person_id = ?
          AND EXISTS (SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?)`,
    ).bind(churchId, groupId, personId, churchId, groupId, operationId),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'group',
      entityId: groupId,
      eventName: 'groups.member.removed',
      operationId,
      table: 'groups',
      now,
      metadata: { personId },
    }),
  ])
  requireParticipationChange(results)
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

groupRosterRoutes.put('/:churchId/:groupId/leaders/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const parsed = leaderUpsertInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const group = await findGroup(c.env.DB, churchId, groupId)
  await requirePerson(c.env.DB, churchId, personId)

  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    touchGroup(
      c.env.DB,
      churchId,
      groupId,
      now,
      operationId,
      `COALESCE((SELECT version FROM group_leaders WHERE church_id = ? AND group_id = ? AND person_id = ?), 0) = ? AND (EXISTS (SELECT 1 FROM people WHERE church_id = ? AND id = ? AND deleted_at IS NULL))`,
      [churchId, groupId, personId, parsed.data.version, churchId, personId],
    ),
    c.env.DB.prepare(
      `
          INSERT INTO group_leaders (church_id, group_id, person_id, role, created_at)
          SELECT ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
          ON CONFLICT(group_id, person_id) DO UPDATE SET role = excluded.role, version = group_leaders.version + 1
        `,
    ).bind(
      churchId,
      groupId,
      personId,
      parsed.data.role,
      now,
      churchId,
      groupId,
      operationId,
    ),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'group',
      entityId: groupId,
      eventName: 'groups.leader.upserted',
      operationId,
      table: 'groups',
      now,
      metadata: { personId, role: parsed.data.role },
    }),
  ])
  requireParticipationChange(results)
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

groupRosterRoutes.delete('/:churchId/:groupId/leaders/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const group = await findGroup(c.env.DB, churchId, groupId)

  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    touchGroup(
      c.env.DB,
      churchId,
      groupId,
      now,
      operationId,
      `COALESCE((SELECT version FROM group_leaders WHERE church_id = ? AND group_id = ? AND person_id = ?), 0) = ? AND (1 = 1)`,
      [churchId, groupId, personId, parsed.data.version],
    ),
    c.env.DB.prepare(
      `DELETE FROM group_leaders WHERE church_id = ? AND group_id = ? AND person_id = ?
          AND EXISTS (SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?)`,
    ).bind(churchId, groupId, personId, churchId, groupId, operationId),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'group',
      entityId: groupId,
      eventName: 'groups.leader.removed',
      operationId,
      table: 'groups',
      now,
      metadata: { personId },
    }),
  ])
  requireParticipationChange(results)
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})
