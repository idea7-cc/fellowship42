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
import { mapEvent, type EventRow } from '../lib/records'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

const eventFields = {
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  status: publishStatusSchema,
  summary: z.string().trim().max(4_000),
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().positive().nullable(),
  timezone: z.string().trim().min(1).max(64),
  location: z.string().trim().max(240),
  registrationUrl: z.url().nullable(),
  capacity: z.number().int().positive().max(1_000_000).nullable(),
  featured: z.boolean(),
}
const eventCreateInput = z
  .object({
    ...eventFields,
    status: publishStatusSchema.default('draft'),
    summary: eventFields.summary.default(''),
    endsAt: eventFields.endsAt.default(null),
    location: eventFields.location.default(''),
    registrationUrl: eventFields.registrationUrl.default(null),
    capacity: eventFields.capacity.default(null),
    featured: eventFields.featured.default(false),
  })
  .strict()
  .refine((value) => value.endsAt === null || value.endsAt > value.startsAt, {
    path: ['endsAt'],
    message: 'Event end must be after its start',
  })
const eventUpdateInput = z
  .object({
    version: z.number().int().positive(),
    slug: eventFields.slug.optional(),
    title: eventFields.title.optional(),
    status: eventFields.status.optional(),
    summary: eventFields.summary.optional(),
    startsAt: eventFields.startsAt.optional(),
    endsAt: eventFields.endsAt.optional(),
    timezone: eventFields.timezone.optional(),
    location: eventFields.location.optional(),
    registrationUrl: eventFields.registrationUrl.optional(),
    capacity: eventFields.capacity.optional(),
    featured: eventFields.featured.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one event field must be changed',
  })
const listInput = z.object({
  query: z.string().trim().max(100).optional(),
  status: publishStatusSchema.optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const eventSelect = `
  SELECT id, church_id, slug, title, status, summary, starts_at, ends_at,
         timezone, location, registration_url, capacity, featured, version
  FROM events
`

function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
  } catch {
    throw new AppError(422, 'invalid_timezone', 'Choose a valid IANA timezone')
  }
}

async function findEvent(db: D1Database, churchId: string, eventId: string) {
  const row = await db
    .prepare(
      `${eventSelect} WHERE church_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(churchId, eventId)
    .first<EventRow>()
  if (!row) throw new AppError(404, 'event_not_found', 'Event not found')
  return row
}

export const eventRoutes = new Hono<AppEnv>()

eventRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'events.write')
  const parsed = listInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)
  const conditions = ['church_id = ?', 'deleted_at IS NULL']
  const bindings: unknown[] = [churchId]
  if (parsed.data.query) {
    const pattern = `%${escapeLike(parsed.data.query)}%`
    conditions.push(`(
      title LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      summary LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      location LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`)
    bindings.push(pattern, pattern, pattern)
  }
  if (parsed.data.status) {
    conditions.push('status = ?')
    bindings.push(parsed.data.status)
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB.prepare(
      'SELECT starts_at, id FROM events WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
      .bind(churchId, parsed.data.cursor)
      .first<{ starts_at: number; id: string }>()
    if (!cursor)
      throw new AppError(422, 'invalid_cursor', 'The event cursor is invalid')
    conditions.push('(starts_at > ? OR (starts_at = ? AND id > ?))')
    bindings.push(cursor.starts_at, cursor.starts_at, cursor.id)
  }
  const result = await c.env.DB.prepare(
    `${eventSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY starts_at, id
      LIMIT ?
    `,
  )
    .bind(...bindings, parsed.data.limit + 1)
    .all<EventRow>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore
    ? result.results.slice(0, parsed.data.limit)
    : result.results
  return c.json({
    events: rows.map(mapEvent),
    page: {
      limit: parsed.data.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  })
})

eventRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'events.write')
  const parsed = eventCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  validateTimezone(parsed.data.timezone)
  const eventId = `event_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
          INSERT INTO events (
            id, church_id, slug, title, status, summary, starts_at, ends_at,
            timezone, location, registration_url, capacity, featured,
            version, created_at, updated_at, last_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `,
      ).bind(
        eventId,
        churchId,
        parsed.data.slug,
        parsed.data.title,
        parsed.data.status,
        parsed.data.summary,
        parsed.data.startsAt,
        parsed.data.endsAt,
        parsed.data.timezone,
        parsed.data.location,
        parsed.data.registrationUrl,
        parsed.data.capacity,
        parsed.data.featured ? 1 : 0,
        now,
        now,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'event',
        entityId: eventId,
        eventName: 'events.created',
        operationId,
        table: 'events',
        now,
        metadata: {
          status: parsed.data.status,
          startsAt: parsed.data.startsAt,
        },
      }),
    ])
  } catch (error) {
    if (isSlugConflict(error, 'events')) {
      throw new AppError(
        409,
        'event_slug_exists',
        'An event already uses this slug',
      )
    }
    throw error
  }
  broadcastContent(c, churchId, 'event', eventId, 'created')
  return c.json(
    { event: mapEvent(await findEvent(c.env.DB, churchId, eventId)) },
    201,
  )
})

eventRoutes.get('/:churchId/:eventId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'events.write')
  return c.json({
    event: mapEvent(
      await findEvent(c.env.DB, churchId, c.req.param('eventId')),
    ),
  })
})

eventRoutes.patch('/:churchId/:eventId', async (c) => {
  const churchId = c.req.param('churchId')
  const eventId = c.req.param('eventId')
  const actor = await requirePermission(c, churchId, 'events.write')
  const parsed = eventUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findEvent(c.env.DB, churchId, eventId)
  if (current.version !== parsed.data.version) {
    throw new AppError(
      409,
      'version_conflict',
      'The event changed after it was loaded',
    )
  }
  const next = {
    slug: parsed.data.slug ?? current.slug,
    title: parsed.data.title ?? current.title,
    status: parsed.data.status ?? current.status,
    summary: parsed.data.summary ?? current.summary,
    startsAt: parsed.data.startsAt ?? current.starts_at,
    endsAt:
      parsed.data.endsAt === undefined ? current.ends_at : parsed.data.endsAt,
    timezone: parsed.data.timezone ?? current.timezone,
    location: parsed.data.location ?? current.location,
    registrationUrl:
      parsed.data.registrationUrl === undefined
        ? current.registration_url
        : parsed.data.registrationUrl,
    capacity:
      parsed.data.capacity === undefined
        ? current.capacity
        : parsed.data.capacity,
    featured:
      parsed.data.featured === undefined
        ? current.featured === 1
        : parsed.data.featured,
  }
  if (next.endsAt !== null && next.endsAt <= next.startsAt) {
    throw new AppError(
      422,
      'invalid_event_time',
      'Event end must be after its start',
    )
  }
  validateTimezone(next.timezone)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  let results: D1Result[]
  try {
    results = await c.env.DB.batch([
      c.env.DB.prepare(
        `
          UPDATE events SET
            slug = ?, title = ?, status = ?, summary = ?, starts_at = ?, ends_at = ?,
            timezone = ?, location = ?, registration_url = ?, capacity = ?, featured = ?,
            version = version + 1, updated_at = ?, last_operation_id = ?
          WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
        `,
      ).bind(
        next.slug,
        next.title,
        next.status,
        next.summary,
        next.startsAt,
        next.endsAt,
        next.timezone,
        next.location,
        next.registrationUrl,
        next.capacity,
        next.featured ? 1 : 0,
        now,
        operationId,
        churchId,
        eventId,
        current.version,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'event',
        entityId: eventId,
        eventName: 'events.updated',
        operationId,
        table: 'events',
        now,
        metadata: {
          changedFields: Object.keys(parsed.data).filter(
            (key) => key !== 'version',
          ),
          status: next.status,
          startsAt: next.startsAt,
        },
      }),
    ])
  } catch (error) {
    if (isSlugConflict(error, 'events')) {
      throw new AppError(
        409,
        'event_slug_exists',
        'An event already uses this slug',
      )
    }
    throw error
  }
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The event changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'event', eventId, 'updated')
  return c.json({
    event: mapEvent(await findEvent(c.env.DB, churchId, eventId)),
  })
})

eventRoutes.delete('/:churchId/:eventId', async (c) => {
  const churchId = c.req.param('churchId')
  const eventId = c.req.param('eventId')
  const actor = await requirePermission(c, churchId, 'events.write')
  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findEvent(c.env.DB, churchId, eventId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE events SET deleted_at = ?, updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `,
    ).bind(now, now, operationId, churchId, eventId, parsed.data.version),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'event',
      entityId: eventId,
      eventName: 'events.deleted',
      operationId,
      table: 'events',
      now,
      metadata: { previousVersion: parsed.data.version },
    }),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The event changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'event', eventId, 'deleted')
  return c.body(null, 204)
})
