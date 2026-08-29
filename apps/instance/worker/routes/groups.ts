import { Hono } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../lib/auth'
import {
  broadcastContent,
  escapeLike,
  isSlugConflict,
  jsonBody,
  mutationEvidence,
  publishStatusSchema,
  slugSchema,
  validationError,
  versionInputSchema,
} from '../lib/content'
import { AppError } from '../lib/errors'
import {
  mapAttendanceEntry,
  mapGroup,
  mapGroupLeader,
  mapGroupMember,
  mapGroupSession,
  type AttendanceEntryRow,
  type GroupLeaderRow,
  type GroupMemberRow,
  type GroupRow,
  type GroupSessionRow,
} from '../lib/records'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

const groupFields = {
  ministryId: z.string().trim().min(1).max(128).nullable(),
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  status: publishStatusSchema,
  groupType: z.string().trim().min(1).max(80),
  audience: z.string().trim().max(160),
  schedule: z.string().trim().max(240),
  location: z.string().trim().min(1).max(240).nullable(),
  enrollmentPolicy: z.enum(['closed', 'request', 'open']),
  capacity: z.number().int().positive().max(100_000).nullable(),
  featured: z.boolean(),
  summary: z.string().trim().max(4_000),
}
const groupCreateInput = z
  .object({
    ...groupFields,
    ministryId: groupFields.ministryId.default(null),
    status: publishStatusSchema.default('draft'),
    audience: groupFields.audience.default(''),
    schedule: groupFields.schedule.default(''),
    location: groupFields.location.default(null),
    enrollmentPolicy: groupFields.enrollmentPolicy.default('closed'),
    capacity: groupFields.capacity.default(null),
    featured: groupFields.featured.default(false),
    summary: groupFields.summary.default(''),
  })
  .strict()
const groupUpdateInput = z
  .object({
    version: z.number().int().positive(),
    ministryId: groupFields.ministryId.optional(),
    slug: groupFields.slug.optional(),
    title: groupFields.title.optional(),
    status: groupFields.status.optional(),
    groupType: groupFields.groupType.optional(),
    audience: groupFields.audience.optional(),
    schedule: groupFields.schedule.optional(),
    location: groupFields.location.optional(),
    enrollmentPolicy: groupFields.enrollmentPolicy.optional(),
    capacity: groupFields.capacity.optional(),
    featured: groupFields.featured.optional(),
    summary: groupFields.summary.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one group field must be changed',
  })
const listInput = z.object({
  query: z.string().trim().max(100).optional(),
  status: publishStatusSchema.optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const groupSelect = `
  SELECT id, church_id, ministry_id, slug, title, status, group_type, audience,
         schedule, location, enrollment_policy, capacity, featured, summary, version
  FROM groups
`

async function findGroup(db: D1Database, churchId: string, groupId: string) {
  const row = await db
    .prepare(
      `${groupSelect} WHERE church_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(churchId, groupId)
    .first<GroupRow>()
  if (!row) throw new AppError(404, 'group_not_found', 'Group not found')
  return row
}

async function requireMinistry(
  db: D1Database,
  churchId: string,
  ministryId: string | null,
) {
  if (!ministryId) return
  const row = await db
    .prepare(
      'SELECT 1 AS present FROM ministries WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
    .bind(churchId, ministryId)
    .first<{ present: number }>()
  if (!row)
    throw new AppError(
      422,
      'invalid_ministry',
      'The selected ministry does not exist in this church',
    )
}

export const groupRoutes = new Hono<AppEnv>()

groupRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'groups.write')
  const parsed = listInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)

  const conditions = ['church_id = ?', 'deleted_at IS NULL']
  const bindings: unknown[] = [churchId]
  if (parsed.data.query) {
    const pattern = `%${escapeLike(parsed.data.query)}%`
    conditions.push(`(
      title LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      summary LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      group_type LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      audience LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      location LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`)
    bindings.push(pattern, pattern, pattern, pattern, pattern)
  }
  if (parsed.data.status) {
    conditions.push('status = ?')
    bindings.push(parsed.data.status)
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB.prepare(
      'SELECT title, id FROM groups WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
      .bind(churchId, parsed.data.cursor)
      .first<{ title: string; id: string }>()
    if (!cursor)
      throw new AppError(422, 'invalid_cursor', 'The group cursor is invalid')
    conditions.push(
      '(title COLLATE NOCASE > ? COLLATE NOCASE OR (title = ? COLLATE NOCASE AND id > ?))',
    )
    bindings.push(cursor.title, cursor.title, cursor.id)
  }

  const result = await c.env.DB.prepare(
    `${groupSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY title COLLATE NOCASE, id
      LIMIT ?
    `,
  )
    .bind(...bindings, parsed.data.limit + 1)
    .all<GroupRow>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore
    ? result.results.slice(0, parsed.data.limit)
    : result.results
  return c.json({
    groups: rows.map(mapGroup),
    page: {
      limit: parsed.data.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  })
})

groupRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const parsed = groupCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await requireMinistry(c.env.DB, churchId, parsed.data.ministryId)

  const groupId = `group_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
          INSERT INTO groups (
            id, church_id, ministry_id, slug, title, status, group_type, audience,
            schedule, location, enrollment_policy, capacity, featured, summary,
            version, created_at, updated_at, last_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `,
      ).bind(
        groupId,
        churchId,
        parsed.data.ministryId,
        parsed.data.slug,
        parsed.data.title,
        parsed.data.status,
        parsed.data.groupType,
        parsed.data.audience,
        parsed.data.schedule,
        parsed.data.location,
        parsed.data.enrollmentPolicy,
        parsed.data.capacity,
        parsed.data.featured ? 1 : 0,
        parsed.data.summary,
        now,
        now,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'group',
        entityId: groupId,
        eventName: 'groups.created',
        operationId,
        table: 'groups',
        now,
        metadata: { status: parsed.data.status },
      }),
    ])
  } catch (error) {
    if (isSlugConflict(error, 'groups')) {
      throw new AppError(
        409,
        'group_slug_exists',
        'A group already uses this slug',
      )
    }
    throw error
  }
  broadcastContent(c, churchId, 'group', groupId, 'created')
  return c.json(
    { group: mapGroup(await findGroup(c.env.DB, churchId, groupId)) },
    201,
  )
})

groupRoutes.get('/:churchId/:groupId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'groups.write')
  return c.json({
    group: mapGroup(
      await findGroup(c.env.DB, churchId, c.req.param('groupId')),
    ),
  })
})

groupRoutes.patch('/:churchId/:groupId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const parsed = groupUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findGroup(c.env.DB, churchId, groupId)
  if (current.version !== parsed.data.version) {
    throw new AppError(
      409,
      'version_conflict',
      'The group changed after it was loaded',
    )
  }
  const next = {
    ministryId:
      parsed.data.ministryId === undefined
        ? current.ministry_id
        : parsed.data.ministryId,
    slug: parsed.data.slug ?? current.slug,
    title: parsed.data.title ?? current.title,
    status: parsed.data.status ?? current.status,
    groupType: parsed.data.groupType ?? current.group_type,
    audience: parsed.data.audience ?? current.audience,
    schedule: parsed.data.schedule ?? current.schedule,
    location:
      parsed.data.location === undefined
        ? current.location
        : parsed.data.location,
    enrollmentPolicy: parsed.data.enrollmentPolicy ?? current.enrollment_policy,
    capacity:
      parsed.data.capacity === undefined
        ? current.capacity
        : parsed.data.capacity,
    featured:
      parsed.data.featured === undefined
        ? current.featured === 1
        : parsed.data.featured,
    summary: parsed.data.summary ?? current.summary,
  }
  await requireMinistry(c.env.DB, churchId, next.ministryId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  let results: D1Result[]
  try {
    results = await c.env.DB.batch([
      c.env.DB.prepare(
        `
          UPDATE groups SET
            ministry_id = ?, slug = ?, title = ?, status = ?, group_type = ?,
            audience = ?, schedule = ?, location = ?, enrollment_policy = ?, capacity = ?,
            featured = ?, summary = ?, version = version + 1, updated_at = ?, last_operation_id = ?
          WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
        `,
      ).bind(
        next.ministryId,
        next.slug,
        next.title,
        next.status,
        next.groupType,
        next.audience,
        next.schedule,
        next.location,
        next.enrollmentPolicy,
        next.capacity,
        next.featured ? 1 : 0,
        next.summary,
        now,
        operationId,
        churchId,
        groupId,
        current.version,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'group',
        entityId: groupId,
        eventName: 'groups.updated',
        operationId,
        table: 'groups',
        now,
        metadata: {
          changedFields: Object.keys(parsed.data).filter(
            (key) => key !== 'version',
          ),
          status: next.status,
        },
      }),
    ])
  } catch (error) {
    if (isSlugConflict(error, 'groups')) {
      throw new AppError(
        409,
        'group_slug_exists',
        'A group already uses this slug',
      )
    }
    throw error
  }
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The group changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json({
    group: mapGroup(await findGroup(c.env.DB, churchId, groupId)),
  })
})

groupRoutes.delete('/:churchId/:groupId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findGroup(c.env.DB, churchId, groupId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE groups SET deleted_at = ?, updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `,
    ).bind(now, now, operationId, churchId, groupId, parsed.data.version),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'group',
      entityId: groupId,
      eventName: 'groups.deleted',
      operationId,
      table: 'groups',
      now,
      metadata: { previousVersion: parsed.data.version },
    }),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The group changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'group', groupId, 'deleted')
  return c.body(null, 204)
})

// ---------------------------------------------------------------------------
// Group roster
//
// A group nobody can join is a brochure. These endpoints put people into
// groups and name their leaders.
//
// Roster changes stamp the group's `last_operation_id` and `updated_at` but
// deliberately do NOT bump its `version`. Version guards concurrent edits to
// the group record itself; adding a member is not a competing edit to the
// group's title, and bumping it would make two staff working the same group
// collide for no reason. Stamping the operation id still lets the shared
// evidence helper write audit and outbox rows atomically with the change.
// ---------------------------------------------------------------------------

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
    status: membershipStatusSchema.default('active'),
    notes: z.string().trim().max(4_000).nullable().default(null),
  })
  .strict()

const leaderUpsertInput = z
  .object({ role: leaderRoleSchema.default('leader') })
  .strict()

async function requirePerson(db: D1Database, churchId: string, personId: string) {
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

/** Stamps the group so `mutationEvidence` can attach audit and outbox rows. */
function touchGroup(
  db: D1Database,
  churchId: string,
  groupId: string,
  now: number,
  operationId: string,
) {
  return db
    .prepare(
      `
        UPDATE groups SET updated_at = ?, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL
      `,
    )
    .bind(now, operationId, churchId, groupId)
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
                 m.status, m.joined_at, m.notes
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
          SELECT l.group_id, l.person_id, p.first_name, p.last_name, p.email, l.role
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

groupRoutes.get('/:churchId/:groupId/roster', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  await requirePermission(c, churchId, 'groups.write')
  const group = await findGroup(c.env.DB, churchId, groupId)
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

groupRoutes.put('/:churchId/:groupId/members/:personId', async (c) => {
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
    const existing = await c.env.DB
      .prepare(
        `
          SELECT COUNT(*) AS total FROM group_memberships
          WHERE church_id = ? AND group_id = ? AND status = 'active' AND person_id <> ?
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
  await c.env.DB.batch([
    touchGroup(c.env.DB, churchId, groupId, now, operationId),
    c.env.DB
      .prepare(
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
            status = excluded.status,
            notes = excluded.notes,
            joined_at = COALESCE(group_memberships.joined_at, excluded.joined_at),
            updated_at = excluded.updated_at
        `,
      )
      .bind(
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
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

groupRoutes.delete('/:churchId/:groupId/members/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const group = await findGroup(c.env.DB, churchId, groupId)

  const operationId = crypto.randomUUID()
  const now = Date.now()
  await c.env.DB.batch([
    touchGroup(c.env.DB, churchId, groupId, now, operationId),
    c.env.DB
      .prepare(
        'DELETE FROM group_memberships WHERE church_id = ? AND group_id = ? AND person_id = ?',
      )
      .bind(churchId, groupId, personId),
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
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

groupRoutes.put('/:churchId/:groupId/leaders/:personId', async (c) => {
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
  await c.env.DB.batch([
    touchGroup(c.env.DB, churchId, groupId, now, operationId),
    c.env.DB
      .prepare(
        `
          INSERT INTO group_leaders (church_id, group_id, person_id, role, created_at)
          SELECT ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
          ON CONFLICT(group_id, person_id) DO UPDATE SET role = excluded.role
        `,
      )
      .bind(
        churchId, groupId, personId, parsed.data.role, now,
        churchId, groupId, operationId,
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
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

groupRoutes.delete('/:churchId/:groupId/leaders/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const group = await findGroup(c.env.DB, churchId, groupId)

  const operationId = crypto.randomUUID()
  const now = Date.now()
  await c.env.DB.batch([
    touchGroup(c.env.DB, churchId, groupId, now, operationId),
    c.env.DB
      .prepare(
        'DELETE FROM group_leaders WHERE church_id = ? AND group_id = ? AND person_id = ?',
      )
      .bind(churchId, groupId, personId),
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
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json(await readRoster(c.env.DB, churchId, groupId, group.capacity))
})

// ---------------------------------------------------------------------------
// Group sessions and attendance
//
// A session is one meeting occurrence. Attendance hangs off sessions
// (`attendance_records.session_id`), so there is no way to record who came
// without first recording that the group met.
//
// `group_sessions` has no `version` or `last_operation_id` column, so as with
// rosters these mutations stamp the parent group. Sessions are high-volume and
// short-lived; optimistic concurrency on the group record would only produce
// false conflicts between leaders working different weeks.
//
// Sessions require `groups.write`. Attendance requires `attendance.write`,
// which the seeded ministry-leader role already carries — a leader can take a
// register without being able to restructure the group.
// ---------------------------------------------------------------------------

const sessionStatusSchema = z.enum(['planned', 'open', 'submitted', 'cancelled'])
const attendanceStatusSchema = z.enum(['present', 'absent', 'excused', 'serving'])

const sessionFields = {
  title: z.string().trim().min(1).max(200),
  startsAt: z.number().int().positive(),
  endsAt: z.number().int().positive().nullable(),
  location: z.string().trim().min(1).max(240).nullable(),
  topic: z.string().trim().max(2_000).nullable(),
  status: sessionStatusSchema,
}

const sessionCreateInput = z
  .object({
    ...sessionFields,
    endsAt: sessionFields.endsAt.default(null),
    location: sessionFields.location.default(null),
    topic: sessionFields.topic.default(null),
    status: sessionStatusSchema.default('planned'),
  })
  .strict()
  .refine(
    (value) => value.endsAt === null || value.endsAt >= value.startsAt,
    { message: 'A session cannot end before it starts', path: ['endsAt'] },
  )

const sessionUpdateInput = z
  .object({
    title: sessionFields.title.optional(),
    startsAt: sessionFields.startsAt.optional(),
    endsAt: sessionFields.endsAt.optional(),
    location: sessionFields.location.optional(),
    topic: sessionFields.topic.optional(),
    status: sessionFields.status.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one session field must be changed',
  })

const attendanceInput = z
  .object({
    status: attendanceStatusSchema,
    notes: z.string().trim().max(2_000).nullable().default(null),
  })
  .strict()

const sessionSelect = `
  SELECT id, group_id, title, status, starts_at, ends_at, location, topic
  FROM group_sessions
`

async function findSession(
  db: D1Database,
  churchId: string,
  groupId: string,
  sessionId: string,
) {
  const row = await db
    .prepare(`${sessionSelect} WHERE church_id = ? AND group_id = ? AND id = ?`)
    .bind(churchId, groupId, sessionId)
    .first<GroupSessionRow>()
  if (!row) throw new AppError(404, 'session_not_found', 'Session not found')
  return row
}

async function readSessions(db: D1Database, churchId: string, groupId: string) {
  const rows = await db
    .prepare(
      `${sessionSelect} WHERE church_id = ? AND group_id = ? ORDER BY starts_at DESC`,
    )
    .bind(churchId, groupId)
    .all<GroupSessionRow>()
  return (rows.results ?? []).map(mapGroupSession)
}

/**
 * The register for one session: every current group member, with their mark if
 * one exists. Returning the roster rather than only the marked rows is what
 * lets the UI show "not recorded" as distinct from "absent".
 */
async function readAttendance(
  db: D1Database,
  churchId: string,
  groupId: string,
  session: GroupSessionRow,
) {
  const rows = await db
    .prepare(
      `
        SELECT p.id AS person_id, p.first_name, p.last_name, p.membership_status,
               a.status, a.checked_in_at, a.notes
        FROM group_memberships m
        JOIN people p ON p.church_id = m.church_id AND p.id = m.person_id
        LEFT JOIN attendance_records a
          ON a.church_id = m.church_id AND a.session_id = ? AND a.person_id = p.id
        WHERE m.church_id = ? AND m.group_id = ?
          AND m.status IN ('active', 'paused')
          AND p.deleted_at IS NULL
        ORDER BY p.sort_name
      `,
    )
    .bind(session.id, churchId, groupId)
    .all<AttendanceEntryRow>()

  const entries = (rows.results ?? []).map(mapAttendanceEntry)
  return {
    session: mapGroupSession(session),
    entries,
    presentCount: entries.filter((entry) => entry.status === 'present').length,
    recordedCount: entries.filter((entry) => entry.status !== undefined).length,
  }
}

groupRoutes.get('/:churchId/:groupId/sessions', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  await requirePermission(c, churchId, 'groups.write')
  await findGroup(c.env.DB, churchId, groupId)
  return c.json({ sessions: await readSessions(c.env.DB, churchId, groupId) })
})

groupRoutes.post('/:churchId/:groupId/sessions', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const parsed = sessionCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findGroup(c.env.DB, churchId, groupId)

  const sessionId = `groupsession_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  await c.env.DB.batch([
    touchGroup(c.env.DB, churchId, groupId, now, operationId),
    c.env.DB
      .prepare(
        `
          INSERT INTO group_sessions (
            id, church_id, group_id, title, starts_at, ends_at, location, topic,
            status, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
        `,
      )
      .bind(
        sessionId, churchId, groupId, parsed.data.title, parsed.data.startsAt,
        parsed.data.endsAt, parsed.data.location, parsed.data.topic,
        parsed.data.status, now, now, churchId, groupId, operationId,
      ),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'group',
      entityId: groupId,
      eventName: 'groups.session.created',
      operationId,
      table: 'groups',
      now,
      metadata: { sessionId, status: parsed.data.status },
    }),
  ])
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json({ sessions: await readSessions(c.env.DB, churchId, groupId) }, 201)
})

groupRoutes.patch('/:churchId/:groupId/sessions/:sessionId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const sessionId = c.req.param('sessionId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  const parsed = sessionUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findGroup(c.env.DB, churchId, groupId)
  const current = await findSession(c.env.DB, churchId, groupId, sessionId)

  const next = {
    title: parsed.data.title ?? current.title,
    startsAt: parsed.data.startsAt ?? current.starts_at,
    endsAt: parsed.data.endsAt === undefined ? current.ends_at : parsed.data.endsAt,
    location: parsed.data.location === undefined ? current.location : parsed.data.location,
    topic: parsed.data.topic === undefined ? current.topic : parsed.data.topic,
    status: parsed.data.status ?? current.status,
  }
  if (next.endsAt !== null && next.endsAt < next.startsAt) {
    throw new AppError(422, 'invalid_session_window', 'A session cannot end before it starts')
  }

  const operationId = crypto.randomUUID()
  const now = Date.now()
  await c.env.DB.batch([
    touchGroup(c.env.DB, churchId, groupId, now, operationId),
    c.env.DB
      .prepare(
        `
          UPDATE group_sessions
          SET title = ?, starts_at = ?, ends_at = ?, location = ?, topic = ?,
              status = ?, updated_at = ?
          WHERE church_id = ? AND group_id = ? AND id = ?
        `,
      )
      .bind(
        next.title, next.startsAt, next.endsAt, next.location, next.topic,
        next.status, now, churchId, groupId, sessionId,
      ),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'group',
      entityId: groupId,
      eventName: 'groups.session.updated',
      operationId,
      table: 'groups',
      now,
      metadata: { sessionId, status: next.status },
    }),
  ])
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json({ sessions: await readSessions(c.env.DB, churchId, groupId) })
})

groupRoutes.delete('/:churchId/:groupId/sessions/:sessionId', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  const sessionId = c.req.param('sessionId')
  const actor = await requirePermission(c, churchId, 'groups.write')
  await findGroup(c.env.DB, churchId, groupId)
  await findSession(c.env.DB, churchId, groupId, sessionId)

  const operationId = crypto.randomUUID()
  const now = Date.now()
  await c.env.DB.batch([
    touchGroup(c.env.DB, churchId, groupId, now, operationId),
    // attendance_records cascades on session delete.
    c.env.DB
      .prepare(
        'DELETE FROM group_sessions WHERE church_id = ? AND group_id = ? AND id = ?',
      )
      .bind(churchId, groupId, sessionId),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'group',
      entityId: groupId,
      eventName: 'groups.session.removed',
      operationId,
      table: 'groups',
      now,
      metadata: { sessionId },
    }),
  ])
  broadcastContent(c, churchId, 'group', groupId, 'updated')
  return c.json({ sessions: await readSessions(c.env.DB, churchId, groupId) })
})

groupRoutes.get('/:churchId/:groupId/sessions/:sessionId/attendance', async (c) => {
  const churchId = c.req.param('churchId')
  const groupId = c.req.param('groupId')
  await requirePermission(c, churchId, 'attendance.write')
  await findGroup(c.env.DB, churchId, groupId)
  const session = await findSession(c.env.DB, churchId, groupId, c.req.param('sessionId'))
  return c.json(await readAttendance(c.env.DB, churchId, groupId, session))
})

groupRoutes.put(
  '/:churchId/:groupId/sessions/:sessionId/attendance/:personId',
  async (c) => {
    const churchId = c.req.param('churchId')
    const groupId = c.req.param('groupId')
    const sessionId = c.req.param('sessionId')
    const personId = c.req.param('personId')
    const actor = await requirePermission(c, churchId, 'attendance.write')
    const parsed = attendanceInput.safeParse(await jsonBody(c))
    if (!parsed.success) throw validationError(parsed.error)
    await findGroup(c.env.DB, churchId, groupId)
    const session = await findSession(c.env.DB, churchId, groupId, sessionId)

    // Only people on the group's roster can be marked. Attendance for someone
    // who was never in the group is a data-entry mistake, not a record.
    const membership = await c.env.DB
      .prepare(
        `
          SELECT 1 AS present FROM group_memberships
          WHERE church_id = ? AND group_id = ? AND person_id = ?
        `,
      )
      .bind(churchId, groupId, personId)
      .first<{ present: number }>()
    if (!membership) {
      throw new AppError(
        422,
        'not_a_group_member',
        'Only people on this group roster can be marked',
      )
    }

    const recordId = `attendance_${crypto.randomUUID()}`
    const operationId = crypto.randomUUID()
    const now = Date.now()
    await c.env.DB.batch([
      touchGroup(c.env.DB, churchId, groupId, now, operationId),
      c.env.DB
        .prepare(
          `
            INSERT INTO attendance_records (
              id, church_id, session_id, person_id, status, checked_in_at,
              notes, created_at, updated_at
            )
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM groups WHERE church_id = ? AND id = ? AND last_operation_id = ?
            )
            ON CONFLICT(session_id, person_id) DO UPDATE SET
              status = excluded.status,
              notes = excluded.notes,
              checked_in_at = excluded.checked_in_at,
              updated_at = excluded.updated_at
          `,
        )
        .bind(
          recordId, churchId, sessionId, personId, parsed.data.status,
          parsed.data.status === 'present' ? now : null,
          parsed.data.notes, now, now, churchId, groupId, operationId,
        ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'group',
        entityId: groupId,
        eventName: 'groups.attendance.recorded',
        operationId,
        table: 'groups',
        now,
        metadata: { sessionId, personId, status: parsed.data.status },
      }),
    ])
    broadcastContent(c, churchId, 'group', groupId, 'updated')
    return c.json(await readAttendance(c.env.DB, churchId, groupId, session))
  },
)
