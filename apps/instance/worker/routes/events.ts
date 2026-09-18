import { eventListInput, eventUpdateInput } from '../../contracts/events'
import {
  findEvent,
  listEvents,
  validateTimezone,
} from '../features/events/read'
import { createEvent } from '../features/events/service'
import { Hono } from 'hono'
import { requirePermission } from '../lib/auth'
import {
  broadcastContent,
  isSlugConflict,
  jsonBody,
  mutationEvidence,
  validationError,
  versionInputSchema,
} from '../lib/content'
import { AppError } from '../lib/errors'
import { mapEvent } from '../lib/records'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

export const eventRoutes = new Hono<AppEnv>()

eventRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'events.write')
  const parsed = eventListInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)
  return c.json(await listEvents(c.env.DB, churchId, parsed.data))
})
eventRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'events.write')
  const result = await createEvent(
    c.env.DB,
    churchId,
    { userId: actor.id, requestId: c.get('requestId') },
    await jsonBody(c),
  )
  broadcastContent(c, churchId, 'event', result.event.id, 'created')
  return c.json({ event: result.event }, 201)
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
