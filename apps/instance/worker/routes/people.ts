import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../lib/auth'
import { AppError } from '../lib/errors'
import { mapPerson, mapPersonDetail, type PersonRow } from '../lib/records'
import type { ChurchChangeEvent } from '../realtime'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

const membershipStatus = z.enum([
  'guest',
  'regular-attender',
  'member',
  'volunteer',
  'inactive',
])
const personFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email(),
  phone: z.string().trim().min(1).max(50),
  membershipStatus,
  volunteerReady: z.boolean(),
  notes: z.string().trim().min(1).max(10_000),
}
const personCreateInput = z
  .object({
    ...personFields,
    email: personFields.email.optional(),
    phone: personFields.phone.optional(),
    membershipStatus: membershipStatus.default('guest'),
    volunteerReady: z.boolean().default(false),
    notes: personFields.notes.optional(),
  })
  .strict()
const personUpdateInput = z
  .object({
    version: z.number().int().positive(),
    firstName: personFields.firstName.optional(),
    lastName: personFields.lastName.optional(),
    email: personFields.email.nullable().optional(),
    phone: personFields.phone.nullable().optional(),
    membershipStatus: membershipStatus.optional(),
    volunteerReady: z.boolean().optional(),
    notes: personFields.notes.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one person field must be changed',
  })
const deleteInput = z.object({ version: z.number().int().positive() }).strict()
const listInput = z.object({
  query: z.string().trim().max(100).optional(),
  status: membershipStatus.optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

type AppContext = Context<AppEnv>
type StoredPerson = PersonRow & {
  sort_name: string
  notes: string | null
  updated_at: number
}

function validationError(error: z.ZodError) {
  return new AppError(422, 'validation_failed', z.prettifyError(error))
}

async function jsonBody(c: AppContext): Promise<unknown> {
  try {
    return await c.req.json<unknown>()
  } catch {
    throw new AppError(400, 'invalid_json', 'The request body must be valid JSON')
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

async function findPerson(db: D1Database, churchId: string, personId: string) {
  const row = await db
    .prepare(`
      SELECT id, church_id, first_name, last_name, sort_name, email, phone,
             membership_status, volunteer_ready, notes, version, updated_at
      FROM people
      WHERE church_id = ? AND id = ? AND deleted_at IS NULL
    `)
    .bind(churchId, personId)
    .first<StoredPerson>()
  if (!row) throw new AppError(404, 'person_not_found', 'Person not found')
  return row
}

function personSnapshot(person: {
  membershipStatus: string
  volunteerReady: boolean
  email?: string | null
  phone?: string | null
  notes?: string | null
}) {
  return {
    membershipStatus: person.membershipStatus,
    volunteerReady: person.volunteerReady,
    hasEmail: Boolean(person.email),
    hasPhone: Boolean(person.phone),
    hasNotes: Boolean(person.notes),
  }
}

function isEmailConflict(error: unknown) {
  return error instanceof Error && error.message.includes('people.church_id, people.email')
}

function broadcast(c: AppContext, churchId: string, personId: string, action: 'created' | 'updated' | 'deleted') {
  const event: ChurchChangeEvent = {
    churchId,
    entity: 'person',
    entityId: personId,
    action,
    occurredAt: Date.now(),
  }
  c.executionCtx.waitUntil(c.env.CHURCH_ROOMS.getByName(churchId).broadcast(event))
}

export const peopleRoutes = new Hono<AppEnv>()

peopleRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'people.read')
  const parsed = listInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)

  const conditions = ['p.church_id = ?', 'p.deleted_at IS NULL']
  const bindings: unknown[] = [churchId]
  if (parsed.data.query) {
    const pattern = `%${escapeLike(parsed.data.query)}%`
    conditions.push(`(
      p.first_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      p.last_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      p.email LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      p.phone LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`)
    bindings.push(pattern, pattern, pattern, pattern)
  }
  if (parsed.data.status) {
    conditions.push('p.membership_status = ?')
    bindings.push(parsed.data.status)
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB
      .prepare(`
        SELECT sort_name, id FROM people
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL
      `)
      .bind(churchId, parsed.data.cursor)
      .first<{ sort_name: string; id: string }>()
    if (!cursor) throw new AppError(422, 'invalid_cursor', 'The directory cursor is invalid')
    conditions.push('(p.sort_name COLLATE NOCASE > ? COLLATE NOCASE OR (p.sort_name = ? COLLATE NOCASE AND p.id > ?))')
    bindings.push(cursor.sort_name, cursor.sort_name, cursor.id)
  }

  const result = await c.env.DB
    .prepare(`
      SELECT p.id, p.church_id, p.first_name, p.last_name, p.email, p.phone,
             p.membership_status, p.volunteer_ready, p.version
      FROM people p
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.sort_name COLLATE NOCASE, p.id
      LIMIT ?
    `)
    .bind(...bindings, parsed.data.limit + 1)
    .all<PersonRow>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore ? result.results.slice(0, parsed.data.limit) : result.results
  return c.json({
    people: rows.map(mapPerson),
    page: {
      limit: parsed.data.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  })
})

peopleRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'people.write')
  const parsed = personCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)

  const id = `person_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const person = parsed.data
  try {
    await c.env.DB.batch([
      c.env.DB
        .prepare(`
          INSERT INTO people (
            id, church_id, first_name, last_name, sort_name, email, phone,
            membership_status, volunteer_ready, notes, version,
            created_at, updated_at, last_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
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
          operationId,
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
          JSON.stringify(personSnapshot(person)),
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
  } catch (error) {
    if (isEmailConflict(error)) {
      throw new AppError(409, 'person_email_exists', 'A person with this email already exists')
    }
    throw error
  }

  broadcast(c, churchId, id, 'created')
  return c.json({ person: mapPerson(await findPerson(c.env.DB, churchId, id)) }, 201)
})

peopleRoutes.get('/:churchId/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'people.read')
  return c.json({
    person: mapPersonDetail(await findPerson(c.env.DB, churchId, c.req.param('personId'))),
  })
})

peopleRoutes.patch('/:churchId/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'people.write')
  const parsed = personUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findPerson(c.env.DB, churchId, personId)
  if (current.version !== parsed.data.version) {
    throw new AppError(409, 'version_conflict', 'The person changed after it was loaded')
  }

  const next = {
    firstName: parsed.data.firstName ?? current.first_name,
    lastName: parsed.data.lastName ?? current.last_name,
    email: parsed.data.email === undefined ? current.email : parsed.data.email,
    phone: parsed.data.phone === undefined ? current.phone : parsed.data.phone,
    membershipStatus: parsed.data.membershipStatus ?? current.membership_status,
    volunteerReady:
      parsed.data.volunteerReady === undefined
        ? current.volunteer_ready === 1
        : parsed.data.volunteerReady,
    notes: parsed.data.notes === undefined ? current.notes : parsed.data.notes,
  }
  const operationId = crypto.randomUUID()
  const now = Date.now()
  let results: D1Result[]
  try {
    results = await c.env.DB.batch([
      c.env.DB
        .prepare(`
          UPDATE people SET
            first_name = ?, last_name = ?, sort_name = ?, email = ?, phone = ?,
            membership_status = ?, volunteer_ready = ?, notes = ?,
            version = version + 1, updated_at = ?, last_operation_id = ?
          WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
        `)
        .bind(
          next.firstName,
          next.lastName,
          `${next.lastName}, ${next.firstName}`,
          next.email?.toLowerCase() ?? null,
          next.phone ?? null,
          next.membershipStatus,
          next.volunteerReady ? 1 : 0,
          next.notes ?? null,
          now,
          operationId,
          churchId,
          personId,
          current.version,
        ),
      c.env.DB
        .prepare(`
          INSERT INTO audit_events (
            id, church_id, actor_user_id, action, entity_type, entity_id,
            request_id, before_json, after_json, metadata_json, occurred_at
          )
          SELECT ?, ?, ?, 'people.updated', 'person', ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM people
            WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
        `)
        .bind(
          crypto.randomUUID(),
          churchId,
          actor.id,
          personId,
          c.get('requestId'),
          JSON.stringify(
            personSnapshot({
              membershipStatus: current.membership_status,
              volunteerReady: current.volunteer_ready === 1,
              email: current.email,
              phone: current.phone,
              notes: current.notes,
            }),
          ),
          JSON.stringify(personSnapshot(next)),
          JSON.stringify({ changedFields: Object.keys(parsed.data).filter((key) => key !== 'version') }),
          now,
          churchId,
          personId,
          operationId,
        ),
      c.env.DB
        .prepare(`
          INSERT INTO outbox_events (
            id, church_id, topic, aggregate_type, aggregate_id, payload_json,
            status, available_at, created_at
          )
          SELECT ?, ?, 'people.updated', 'person', ?, ?, 'pending', ?, ?
          WHERE EXISTS (
            SELECT 1 FROM people
            WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
        `)
        .bind(
          crypto.randomUUID(),
          churchId,
          personId,
          JSON.stringify({ personId }),
          now,
          now,
          churchId,
          personId,
          operationId,
        ),
    ])
  } catch (error) {
    if (isEmailConflict(error)) {
      throw new AppError(409, 'person_email_exists', 'A person with this email already exists')
    }
    throw error
  }
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'version_conflict', 'The person changed after it was loaded')
  }

  broadcast(c, churchId, personId, 'updated')
  return c.json({ person: mapPersonDetail(await findPerson(c.env.DB, churchId, personId)) })
})

peopleRoutes.delete('/:churchId/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'people.write')
  const parsed = deleteInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findPerson(c.env.DB, churchId, personId)

  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB
      .prepare(`
        UPDATE people SET
          deleted_at = ?, updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `)
      .bind(now, now, operationId, churchId, personId, parsed.data.version),
    c.env.DB
      .prepare(`
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, metadata_json, occurred_at
        )
        SELECT ?, ?, ?, 'people.deleted', 'person', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM people
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(),
        churchId,
        actor.id,
        personId,
        c.get('requestId'),
        JSON.stringify({ previousVersion: parsed.data.version }),
        now,
        churchId,
        personId,
        operationId,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        )
        SELECT ?, ?, 'people.deleted', 'person', ?, ?, 'pending', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM people
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(),
        churchId,
        personId,
        JSON.stringify({ personId }),
        now,
        now,
        churchId,
        personId,
        operationId,
      ),
  ])
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'version_conflict', 'The person changed after it was loaded')
  }

  broadcast(c, churchId, personId, 'deleted')
  return c.body(null, 204)
})
