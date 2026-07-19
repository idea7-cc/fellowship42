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
import { mapGroup, type GroupRow } from '../lib/records'

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
