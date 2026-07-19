import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Household, HouseholdMember } from '../../src/lib/api-types'
import { requirePermission } from '../lib/auth'
import { AppError } from '../lib/errors'
import type { ChurchChangeEvent } from '../realtime'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}
type AppContext = Context<AppEnv>

const relationshipSchema = z.enum(['spouse', 'child', 'parent', 'guardian', 'other'])
const memberInput = z
  .object({
    personId: z.string().trim().min(1).max(128),
    relationship: relationshipSchema.default('other'),
    isPrimary: z.boolean().default(false),
  })
  .strict()
const addressFields = {
  street: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(30),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
}
const householdCreateInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    street: addressFields.street.optional(),
    city: addressFields.city.optional(),
    state: addressFields.state.optional(),
    postalCode: addressFields.postalCode.optional(),
    countryCode: addressFields.countryCode.default('US'),
    members: z.array(memberInput).max(50).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.members.map((member) => member.personId)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['members'], message: 'Household members must be unique' })
    }
    if (value.members.filter((member) => member.isPrimary).length > 1) {
      context.addIssue({ code: 'custom', path: ['members'], message: 'Only one member can be primary' })
    }
  })
const householdUpdateInput = z
  .object({
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    street: addressFields.street.nullable().optional(),
    city: addressFields.city.nullable().optional(),
    state: addressFields.state.nullable().optional(),
    postalCode: addressFields.postalCode.nullable().optional(),
    countryCode: addressFields.countryCode.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one household field must be changed',
  })
const memberUpdateInput = z
  .object({
    version: z.number().int().positive(),
    relationship: relationshipSchema,
    isPrimary: z.boolean(),
  })
  .strict()
const versionInput = z.object({ version: z.number().int().positive() }).strict()
const listInput = z.object({
  query: z.string().trim().max(100).optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

interface HouseholdRow {
  id: string
  church_id: string
  name: string
  street: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country_code: string
  version: number
}

interface MemberRow {
  household_id: string
  person_id: string
  first_name: string
  last_name: string
  relationship: HouseholdMember['relationship']
  is_primary: number
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

function mapHousehold(row: HouseholdRow, members: HouseholdMember[]): Household {
  return {
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    address: {
      street: row.street ?? undefined,
      city: row.city ?? undefined,
      state: row.region ?? undefined,
      postalCode: row.postal_code ?? undefined,
      countryCode: row.country_code,
    },
    members,
    version: row.version,
  }
}

function mapMember(row: MemberRow): HouseholdMember {
  return {
    personId: row.person_id,
    firstName: row.first_name,
    lastName: row.last_name,
    relationship: row.relationship,
    isPrimary: row.is_primary === 1,
  }
}

async function findHousehold(db: D1Database, churchId: string, householdId: string) {
  const row = await db
    .prepare(`
      SELECT id, church_id, name, street, city, region, postal_code, country_code, version
      FROM households
      WHERE church_id = ? AND id = ? AND deleted_at IS NULL
    `)
    .bind(churchId, householdId)
    .first<HouseholdRow>()
  if (!row) throw new AppError(404, 'household_not_found', 'Household not found')
  return row
}

async function membersFor(db: D1Database, churchId: string, householdIds: string[]) {
  const byHousehold = new Map<string, HouseholdMember[]>()
  if (householdIds.length === 0) return byHousehold
  const placeholders = householdIds.map(() => '?').join(', ')
  const result = await db
    .prepare(`
      SELECT hp.household_id, hp.person_id, p.first_name, p.last_name,
             hp.relationship, hp.is_primary
      FROM household_people hp
      JOIN people p ON p.church_id = hp.church_id AND p.id = hp.person_id
      WHERE hp.church_id = ? AND hp.household_id IN (${placeholders})
        AND p.deleted_at IS NULL
      ORDER BY hp.household_id, hp.is_primary DESC, p.sort_name COLLATE NOCASE, p.id
    `)
    .bind(churchId, ...householdIds)
    .all<MemberRow>()
  for (const row of result.results) {
    const members = byHousehold.get(row.household_id) ?? []
    members.push(mapMember(row))
    byHousehold.set(row.household_id, members)
  }
  return byHousehold
}

async function requirePeople(db: D1Database, churchId: string, personIds: string[]) {
  if (personIds.length === 0) return
  const placeholders = personIds.map(() => '?').join(', ')
  const result = await db
    .prepare(`
      SELECT id FROM people
      WHERE church_id = ? AND deleted_at IS NULL AND id IN (${placeholders})
    `)
    .bind(churchId, ...personIds)
    .all<{ id: string }>()
  if (result.results.length !== personIds.length) {
    throw new AppError(422, 'invalid_household_member', 'Every household member must be an active person in this church')
  }
}

function householdSnapshot(row: {
  street?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  countryCode: string
  memberCount?: number
}) {
  return {
    hasStreet: Boolean(row.street),
    hasCity: Boolean(row.city),
    hasState: Boolean(row.state),
    hasPostalCode: Boolean(row.postalCode),
    countryCode: row.countryCode,
    memberCount: row.memberCount ?? null,
  }
}

function broadcast(c: AppContext, churchId: string, householdId: string, action: ChurchChangeEvent['action']) {
  c.executionCtx.waitUntil(
    c.env.CHURCH_ROOMS.getByName(churchId).broadcast({
      churchId,
      entity: 'household',
      entityId: householdId,
      action,
      occurredAt: Date.now(),
    }),
  )
}

export const householdRoutes = new Hono<AppEnv>()

householdRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'households.read')
  const parsed = listInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)

  const conditions = ['h.church_id = ?', 'h.deleted_at IS NULL']
  const bindings: unknown[] = [churchId]
  if (parsed.data.query) {
    const pattern = `%${escapeLike(parsed.data.query)}%`
    conditions.push(`(
      h.name LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      h.street LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      h.city LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      EXISTS (
        SELECT 1 FROM household_people hp
        JOIN people p ON p.church_id = hp.church_id AND p.id = hp.person_id
        WHERE hp.church_id = h.church_id AND hp.household_id = h.id
          AND p.deleted_at IS NULL
          AND (p.first_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR p.last_name LIKE ? ESCAPE '\\' COLLATE NOCASE)
      )
    )`)
    bindings.push(pattern, pattern, pattern, pattern, pattern)
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB
      .prepare('SELECT name, id FROM households WHERE church_id = ? AND id = ? AND deleted_at IS NULL')
      .bind(churchId, parsed.data.cursor)
      .first<{ name: string; id: string }>()
    if (!cursor) throw new AppError(422, 'invalid_cursor', 'The household cursor is invalid')
    conditions.push('(h.name COLLATE NOCASE > ? COLLATE NOCASE OR (h.name = ? COLLATE NOCASE AND h.id > ?))')
    bindings.push(cursor.name, cursor.name, cursor.id)
  }

  const result = await c.env.DB
    .prepare(`
      SELECT h.id, h.church_id, h.name, h.street, h.city, h.region,
             h.postal_code, h.country_code, h.version
      FROM households h
      WHERE ${conditions.join(' AND ')}
      ORDER BY h.name COLLATE NOCASE, h.id
      LIMIT ?
    `)
    .bind(...bindings, parsed.data.limit + 1)
    .all<HouseholdRow>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore ? result.results.slice(0, parsed.data.limit) : result.results
  const members = await membersFor(c.env.DB, churchId, rows.map((row) => row.id))
  return c.json({
    households: rows.map((row) => mapHousehold(row, members.get(row.id) ?? [])),
    page: { limit: parsed.data.limit, nextCursor: hasMore ? rows.at(-1)!.id : null },
  })
})

householdRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'households.write')
  const parsed = householdCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await requirePeople(c.env.DB, churchId, parsed.data.members.map((member) => member.personId))

  const householdId = `household_${crypto.randomUUID()}`
  const now = Date.now()
  const statements: D1PreparedStatement[] = [
    c.env.DB
      .prepare(`
        INSERT INTO households (
          id, church_id, name, street, city, region, postal_code, country_code,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .bind(
        householdId,
        churchId,
        parsed.data.name,
        parsed.data.street ?? null,
        parsed.data.city ?? null,
        parsed.data.state ?? null,
        parsed.data.postalCode ?? null,
        parsed.data.countryCode,
        now,
        now,
      ),
    ...parsed.data.members.map((member) =>
      c.env.DB
        .prepare(`
          INSERT INTO household_people (
            church_id, household_id, person_id, relationship, is_primary, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
          churchId,
          householdId,
          member.personId,
          member.relationship,
          member.isPrimary ? 1 : 0,
          now,
        ),
    ),
    c.env.DB
      .prepare(`
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, after_json, occurred_at
        ) VALUES (?, ?, ?, 'households.created', 'household', ?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        churchId,
        actor.id,
        householdId,
        c.get('requestId'),
        JSON.stringify(householdSnapshot({ ...parsed.data, memberCount: parsed.data.members.length })),
        now,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        ) VALUES (?, ?, 'households.created', 'household', ?, ?, 'pending', ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        churchId,
        householdId,
        JSON.stringify({ householdId }),
        now,
        now,
      ),
  ]
  await c.env.DB.batch(statements)
  const row = await findHousehold(c.env.DB, churchId, householdId)
  const members = await membersFor(c.env.DB, churchId, [householdId])
  broadcast(c, churchId, householdId, 'created')
  return c.json({ household: mapHousehold(row, members.get(householdId) ?? []) }, 201)
})

householdRoutes.get('/:churchId/:householdId', async (c) => {
  const churchId = c.req.param('churchId')
  const householdId = c.req.param('householdId')
  await requirePermission(c, churchId, 'households.read')
  const row = await findHousehold(c.env.DB, churchId, householdId)
  const members = await membersFor(c.env.DB, churchId, [householdId])
  return c.json({ household: mapHousehold(row, members.get(householdId) ?? []) })
})

householdRoutes.patch('/:churchId/:householdId', async (c) => {
  const churchId = c.req.param('churchId')
  const householdId = c.req.param('householdId')
  const actor = await requirePermission(c, churchId, 'households.write')
  const parsed = householdUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findHousehold(c.env.DB, churchId, householdId)
  if (current.version !== parsed.data.version) {
    throw new AppError(409, 'version_conflict', 'The household changed after it was loaded')
  }
  const next = {
    name: parsed.data.name ?? current.name,
    street: parsed.data.street === undefined ? current.street : parsed.data.street,
    city: parsed.data.city === undefined ? current.city : parsed.data.city,
    state: parsed.data.state === undefined ? current.region : parsed.data.state,
    postalCode: parsed.data.postalCode === undefined ? current.postal_code : parsed.data.postalCode,
    countryCode: parsed.data.countryCode ?? current.country_code,
  }
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB
      .prepare(`
        UPDATE households SET
          name = ?, street = ?, city = ?, region = ?, postal_code = ?, country_code = ?,
          version = version + 1, updated_at = ?, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `)
      .bind(
        next.name, next.street, next.city, next.state, next.postalCode, next.countryCode,
        now, operationId, churchId, householdId, current.version,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, metadata_json, occurred_at
        )
        SELECT ?, ?, ?, 'households.updated', 'household', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(), churchId, actor.id, householdId, c.get('requestId'),
        JSON.stringify({ changedFields: Object.keys(parsed.data).filter((key) => key !== 'version') }),
        now, churchId, householdId, operationId,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        )
        SELECT ?, ?, 'households.updated', 'household', ?, ?, 'pending', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(), churchId, householdId, JSON.stringify({ householdId }),
        now, now, churchId, householdId, operationId,
      ),
  ])
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'version_conflict', 'The household changed after it was loaded')
  }
  const row = await findHousehold(c.env.DB, churchId, householdId)
  const members = await membersFor(c.env.DB, churchId, [householdId])
  broadcast(c, churchId, householdId, 'updated')
  return c.json({ household: mapHousehold(row, members.get(householdId) ?? []) })
})

householdRoutes.put('/:churchId/:householdId/members/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const householdId = c.req.param('householdId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'households.write')
  const parsed = memberUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findHousehold(c.env.DB, churchId, householdId)
  if (current.version !== parsed.data.version) {
    throw new AppError(409, 'version_conflict', 'The household changed after it was loaded')
  }
  await requirePeople(c.env.DB, churchId, [personId])
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const statements: D1PreparedStatement[] = [
    c.env.DB
      .prepare(`
        UPDATE households SET version = version + 1, updated_at = ?, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `)
      .bind(now, operationId, churchId, householdId, current.version),
  ]
  if (parsed.data.isPrimary) {
    statements.push(
      c.env.DB
        .prepare(`
          UPDATE household_people SET is_primary = 0
          WHERE church_id = ? AND household_id = ? AND EXISTS (
            SELECT 1 FROM households
            WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
        `)
        .bind(churchId, householdId, churchId, householdId, operationId),
    )
  }
  statements.push(
    c.env.DB
      .prepare(`
        INSERT INTO household_people (
          church_id, household_id, person_id, relationship, is_primary, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
        ON CONFLICT(household_id, person_id) DO UPDATE SET
          relationship = excluded.relationship,
          is_primary = excluded.is_primary
      `)
      .bind(
        churchId, householdId, personId, parsed.data.relationship,
        parsed.data.isPrimary ? 1 : 0, now, churchId, householdId, operationId,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, metadata_json, occurred_at
        )
        SELECT ?, ?, ?, 'households.member.upserted', 'household', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(), churchId, actor.id, householdId, c.get('requestId'),
        JSON.stringify({ personId, relationship: parsed.data.relationship, isPrimary: parsed.data.isPrimary }),
        now, churchId, householdId, operationId,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        )
        SELECT ?, ?, 'households.member.upserted', 'household', ?, ?, 'pending', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(), churchId, householdId,
        JSON.stringify({ householdId, personId }), now, now,
        churchId, householdId, operationId,
      ),
  )
  const results = await c.env.DB.batch(statements)
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'version_conflict', 'The household changed after it was loaded')
  }
  const row = await findHousehold(c.env.DB, churchId, householdId)
  const members = await membersFor(c.env.DB, churchId, [householdId])
  broadcast(c, churchId, householdId, 'updated')
  return c.json({ household: mapHousehold(row, members.get(householdId) ?? []) })
})

householdRoutes.delete('/:churchId/:householdId/members/:personId', async (c) => {
  const churchId = c.req.param('churchId')
  const householdId = c.req.param('householdId')
  const personId = c.req.param('personId')
  const actor = await requirePermission(c, churchId, 'households.write')
  const parsed = versionInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findHousehold(c.env.DB, churchId, householdId)
  if (current.version !== parsed.data.version) {
    throw new AppError(409, 'version_conflict', 'The household changed after it was loaded')
  }
  const membership = await c.env.DB
    .prepare(`
      SELECT 1 AS present FROM household_people
      WHERE church_id = ? AND household_id = ? AND person_id = ?
    `)
    .bind(churchId, householdId, personId)
    .first<{ present: number }>()
  if (!membership) throw new AppError(404, 'household_member_not_found', 'Household member not found')
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB
      .prepare(`
        UPDATE households SET version = version + 1, updated_at = ?, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `)
      .bind(now, operationId, churchId, householdId, current.version),
    c.env.DB
      .prepare(`
        DELETE FROM household_people
        WHERE church_id = ? AND household_id = ? AND person_id = ? AND EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(churchId, householdId, personId, churchId, householdId, operationId),
    c.env.DB
      .prepare(`
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, metadata_json, occurred_at
        )
        SELECT ?, ?, ?, 'households.member.removed', 'household', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(), churchId, actor.id, householdId, c.get('requestId'),
        JSON.stringify({ personId }), now, churchId, householdId, operationId,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        )
        SELECT ?, ?, 'households.member.removed', 'household', ?, ?, 'pending', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(), churchId, householdId,
        JSON.stringify({ householdId, personId }), now, now,
        churchId, householdId, operationId,
      ),
  ])
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'version_conflict', 'The household changed after it was loaded')
  }
  const row = await findHousehold(c.env.DB, churchId, householdId)
  const members = await membersFor(c.env.DB, churchId, [householdId])
  broadcast(c, churchId, householdId, 'updated')
  return c.json({ household: mapHousehold(row, members.get(householdId) ?? []) })
})

householdRoutes.delete('/:churchId/:householdId', async (c) => {
  const churchId = c.req.param('churchId')
  const householdId = c.req.param('householdId')
  const actor = await requirePermission(c, churchId, 'households.write')
  const parsed = versionInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findHousehold(c.env.DB, churchId, householdId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB
      .prepare(`
        UPDATE households SET
          deleted_at = ?, updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `)
      .bind(now, now, operationId, churchId, householdId, parsed.data.version),
    c.env.DB
      .prepare(`
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, metadata_json, occurred_at
        )
        SELECT ?, ?, ?, 'households.deleted', 'household', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(), churchId, actor.id, householdId, c.get('requestId'),
        JSON.stringify({ previousVersion: parsed.data.version }), now,
        churchId, householdId, operationId,
      ),
    c.env.DB
      .prepare(`
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        )
        SELECT ?, ?, 'households.deleted', 'household', ?, ?, 'pending', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM households
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `)
      .bind(
        crypto.randomUUID(), churchId, householdId, JSON.stringify({ householdId }),
        now, now, churchId, householdId, operationId,
      ),
  ])
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'version_conflict', 'The household changed after it was loaded')
  }
  broadcast(c, churchId, householdId, 'deleted')
  return c.body(null, 204)
})
