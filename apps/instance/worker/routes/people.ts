import { Hono } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../lib/auth'
import { AppError } from '../lib/errors'
import { mapPerson, type PersonRow } from '../lib/records'
import type { ChurchChangeEvent } from '../realtime'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

const personInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email().optional(),
  phone: z.string().trim().max(50).optional(),
  membershipStatus: z
    .enum(['guest', 'regular-attender', 'member', 'volunteer', 'inactive'])
    .default('guest'),
  volunteerReady: z.boolean().default(false),
  notes: z.string().trim().max(10_000).optional(),
})

export const peopleRoutes = new Hono<AppEnv>()

peopleRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'people.read')
  const result = await c.env.DB
    .prepare(`
      SELECT id, church_id, first_name, last_name, email, phone,
             membership_status, volunteer_ready
      FROM people
      WHERE church_id = ? AND deleted_at IS NULL
      ORDER BY sort_name
      LIMIT 200
    `)
    .bind(churchId)
    .all<PersonRow>()
  return c.json({ people: result.results.map(mapPerson) })
})

peopleRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'people.write')
  const parsed = personInput.safeParse(await c.req.json<unknown>())
  if (!parsed.success) {
    throw new AppError(422, 'validation_failed', z.prettifyError(parsed.error))
  }

  const id = crypto.randomUUID()
  const now = Date.now()
  const person = parsed.data
  await c.env.DB.batch([
    c.env.DB
      .prepare(`
        INSERT INTO people (
          id, church_id, first_name, last_name, sort_name, email, phone,
          membership_status, volunteer_ready, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        churchId,
        person.firstName,
        person.lastName,
        `${person.lastName}, ${person.firstName}`,
        person.email?.toLowerCase() ?? null,
        person.phone ?? null,
        person.membershipStatus,
        person.volunteerReady ? 1 : 0,
        person.notes ?? null,
        now,
        now,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, after_json, occurred_at
        ) VALUES (?, ?, ?, 'people.created', 'person', ?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        churchId,
        actor.id,
        id,
        c.get('requestId'),
        JSON.stringify(person),
        now,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        ) VALUES (?, ?, 'people.created', 'person', ?, ?, 'pending', ?, ?)
      `)
      .bind(crypto.randomUUID(), churchId, id, JSON.stringify({ personId: id }), now, now),
  ])

  const event: ChurchChangeEvent = {
    churchId,
    entity: 'person',
    entityId: id,
    action: 'created',
    occurredAt: now,
  }
  c.executionCtx.waitUntil(c.env.CHURCH_ROOMS.getByName(churchId).broadcast(event))
  return c.json({ id }, 201)
})
