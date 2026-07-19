import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Household, Person, PersonDetail } from '../src/lib/api-types'
import type { AccessIdentity } from '../worker/lib/auth'
import { AppError } from '../worker/lib/errors'
import { householdRoutes } from '../worker/routes/households'
import { peopleRoutes } from '../worker/routes/people'

const identity: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'demo-owner-access-subject',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}

function directoryApp(requestIdentity: AccessIdentity) {
  const directory = new Hono<{
    Bindings: Env
    Variables: { identity: AccessIdentity | null; requestId: string }
  }>()
  directory.use('*', async (c, next) => {
    c.set('identity', requestIdentity)
    c.set('requestId', 'request_directory_test')
    await next()
  })
  directory.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500
    return c.json(
      {
        error: {
          code: error instanceof AppError ? error.code : 'internal_error',
          message: error instanceof HTTPException ? error.message : 'Internal server error',
        },
      },
      status,
    )
  })
  directory.route('/api/people', peopleRoutes)
  directory.route('/api/households', householdRoutes)
  return directory
}

const app = directoryApp(identity)

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} as unknown as ExecutionContext

async function request(method: string, pathname: string, body?: unknown) {
  return app.fetch(
    new Request(`https://fellowship42.test${pathname}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    executionContext,
  )
}

async function createPerson(
  firstName: string,
  lastName: string,
  extra: Record<string, unknown> = {},
) {
  const response = await request('POST', '/api/people/church_demo', {
    firstName,
    lastName,
    ...extra,
  })
  expect(response.status).toBe(201)
  return (await response.json<{ person: Person }>()).person
}

beforeEach(async () => {
  const now = Date.now()
  await env.DB
    .prepare(`
      INSERT OR IGNORE INTO auth_identities (
        id, user_id, provider, subject, email_at_provider, created_at, updated_at
      ) VALUES ('identity_demo_owner', 'user_demo_owner', ?, ?, ?, ?, ?)
    `)
    .bind(identity.provider, identity.subject, identity.email, now, now)
    .run()
})

describe('people and household directory', () => {
  it('keeps read, write, and household permissions independently enforced', async () => {
    const now = Date.now()
    const leaderIdentity: AccessIdentity = {
      provider: 'cloudflare-access',
      subject: 'ministry-leader-subject',
      email: 'leader@example.test',
      firstName: 'Ministry',
      lastName: 'Leader',
    }
    await env.DB.batch([
      env.DB
        .prepare(`
          INSERT INTO users (
            id, email, first_name, last_name, status, created_at, updated_at
          ) VALUES ('user_leader', ?, 'Ministry', 'Leader', 'active', ?, ?)
        `)
        .bind(leaderIdentity.email, now, now),
      env.DB
        .prepare(`
          INSERT INTO auth_identities (
            id, user_id, provider, subject, email_at_provider, created_at, updated_at
          ) VALUES ('identity_leader', 'user_leader', ?, ?, ?, ?, ?)
        `)
        .bind(
          leaderIdentity.provider,
          leaderIdentity.subject,
          leaderIdentity.email,
          now,
          now,
        ),
      env.DB
        .prepare(`
          INSERT INTO church_memberships (
            id, church_id, user_id, status, joined_at, created_at, updated_at
          ) VALUES ('membership_leader', 'church_demo', 'user_leader', 'active', ?, ?, ?)
        `)
        .bind(now, now, now),
      env.DB
        .prepare(`
          INSERT INTO membership_roles (
            church_id, membership_id, role_id, assigned_at, assigned_by_user_id
          ) VALUES ('church_demo', 'membership_leader', 'role_demo_leader', ?, 'user_demo_owner')
        `)
        .bind(now),
    ])

    const leaderApp = directoryApp(leaderIdentity)
    const fetchAsLeader = (method: string, pathname: string, body?: unknown) =>
      leaderApp.fetch(
        new Request(`https://fellowship42.test${pathname}`, {
          method,
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        env,
        executionContext,
      )

    expect((await fetchAsLeader('GET', '/api/people/church_demo')).status).toBe(200)
    expect(
      (
        await fetchAsLeader('POST', '/api/people/church_demo', {
          firstName: 'No',
          lastName: 'Write',
        })
      ).status,
    ).toBe(403)
    expect((await fetchAsLeader('GET', '/api/households/church_demo')).status).toBe(403)
  })

  it('creates, searches, paginates, updates, audits, and soft-deletes people', async () => {
    const amy = await createPerson('Amy', 'Able', {
      email: 'amy@example.test',
      phone: '555-0101',
      membershipStatus: 'member',
      notes: 'Private care note',
    })
    await createPerson('Ben', 'Baker', { membershipStatus: 'guest' })
    await createPerson('Cara', 'Clark', { membershipStatus: 'member' })

    const firstPageResponse = await request('GET', '/api/people/church_demo?limit=2')
    const firstPage = await firstPageResponse.json<{
      people: Person[]
      page: { nextCursor: string | null }
    }>()
    expect(firstPageResponse.status).toBe(200)
    expect(firstPage.people).toHaveLength(2)
    expect(firstPage.page.nextCursor).toBeTruthy()

    const secondPageResponse = await request(
      'GET',
      `/api/people/church_demo?limit=2&cursor=${encodeURIComponent(firstPage.page.nextCursor!)}`,
    )
    const secondPage = await secondPageResponse.json<{ people: Person[] }>()
    expect(secondPage.people).toHaveLength(1)

    const searchResponse = await request(
      'GET',
      '/api/people/church_demo?query=amy%40example.test&status=member',
    )
    const search = await searchResponse.json<{ people: Person[] }>()
    expect(search.people.map((person) => person.id)).toEqual([amy.id])

    const detailResponse = await request('GET', `/api/people/church_demo/${amy.id}`)
    const detail = await detailResponse.json<{ person: PersonDetail }>()
    expect(detail.person.notes).toBe('Private care note')

    const updateResponse = await request('PATCH', `/api/people/church_demo/${amy.id}`, {
      version: amy.version,
      membershipStatus: 'volunteer',
      notes: null,
    })
    const updated = await updateResponse.json<{ person: PersonDetail }>()
    expect(updateResponse.status).toBe(200)
    expect(updated.person).toMatchObject({ membershipStatus: 'volunteer', version: 2 })
    expect(updated.person.notes).toBeUndefined()

    const staleResponse = await request('PATCH', `/api/people/church_demo/${amy.id}`, {
      version: amy.version,
      phone: '555-9999',
    })
    expect(staleResponse.status).toBe(409)
    await expect(staleResponse.json()).resolves.toMatchObject({
      error: { code: 'version_conflict' },
    })

    const auditRows = await env.DB
      .prepare(`
        SELECT action, after_json
        FROM audit_events
        WHERE entity_type = 'person' AND entity_id = ?
        ORDER BY occurred_at
      `)
      .bind(amy.id)
      .all<{ action: string; after_json: string | null }>()
    expect(auditRows.results.map((row) => row.action)).toEqual(['people.created', 'people.updated'])
    const serializedAudit = JSON.stringify(auditRows.results)
    expect(serializedAudit).not.toContain('amy@example.test')
    expect(serializedAudit).not.toContain('Private care note')

    const deleteResponse = await request('DELETE', `/api/people/church_demo/${amy.id}`, {
      version: updated.person.version,
    })
    expect(deleteResponse.status).toBe(204)
    expect((await request('GET', `/api/people/church_demo/${amy.id}`)).status).toBe(404)
  })

  it('manages household membership with optimistic concurrency and search', async () => {
    const jordan = await createPerson('Jordan', 'Lee')
    const riley = await createPerson('Riley', 'Lee')
    const createResponse = await request('POST', '/api/households/church_demo', {
      name: 'Lee Household',
      city: 'Raleigh',
      state: 'NC',
      countryCode: 'US',
      members: [
        { personId: jordan.id, relationship: 'spouse', isPrimary: true },
        { personId: riley.id, relationship: 'spouse', isPrimary: false },
      ],
    })
    const created = await createResponse.json<{ household: Household }>()
    expect(createResponse.status).toBe(201)
    expect(created.household.members).toHaveLength(2)
    expect(created.household.version).toBe(1)

    const searchedResponse = await request('GET', '/api/households/church_demo?query=Jordan')
    const searched = await searchedResponse.json<{ households: Household[] }>()
    expect(searched.households.map((household) => household.id)).toEqual([created.household.id])

    const memberResponse = await request(
      'PUT',
      `/api/households/church_demo/${created.household.id}/members/${riley.id}`,
      { version: 1, relationship: 'spouse', isPrimary: true },
    )
    const memberUpdated = await memberResponse.json<{ household: Household }>()
    expect(memberUpdated.household.version).toBe(2)
    expect(memberUpdated.household.members.find((member) => member.personId === riley.id)?.isPrimary).toBe(true)
    expect(memberUpdated.household.members.find((member) => member.personId === jordan.id)?.isPrimary).toBe(false)

    const staleResponse = await request(
      'DELETE',
      `/api/households/church_demo/${created.household.id}/members/${jordan.id}`,
      { version: 1 },
    )
    expect(staleResponse.status).toBe(409)

    const removeResponse = await request(
      'DELETE',
      `/api/households/church_demo/${created.household.id}/members/${jordan.id}`,
      { version: 2 },
    )
    const removed = await removeResponse.json<{ household: Household }>()
    expect(removed.household.version).toBe(3)
    expect(removed.household.members.map((member) => member.personId)).toEqual([riley.id])

    const patchResponse = await request(
      'PATCH',
      `/api/households/church_demo/${created.household.id}`,
      { version: 3, name: 'Lee Family' },
    )
    const patched = await patchResponse.json<{ household: Household }>()
    expect(patched.household).toMatchObject({ name: 'Lee Family', version: 4 })

    const deleteResponse = await request(
      'DELETE',
      `/api/households/church_demo/${created.household.id}`,
      { version: 4 },
    )
    expect(deleteResponse.status).toBe(204)
    expect(
      (await request('GET', `/api/households/church_demo/${created.household.id}`)).status,
    ).toBe(404)

    const auditActions = await env.DB
      .prepare(`
        SELECT action FROM audit_events
        WHERE entity_type = 'household' AND entity_id = ?
        ORDER BY occurred_at, rowid
      `)
      .bind(created.household.id)
      .all<{ action: string }>()
    expect(auditActions.results.map((row) => row.action)).toEqual([
      'households.created',
      'households.member.upserted',
      'households.member.removed',
      'households.updated',
      'households.deleted',
    ])

    const outboxTopics = await env.DB
      .prepare(`
        SELECT topic FROM outbox_events
        WHERE aggregate_type = 'household' AND aggregate_id = ?
        ORDER BY created_at, rowid
      `)
      .bind(created.household.id)
      .all<{ topic: string }>()
    expect(outboxTopics.results.map((row) => row.topic)).toEqual([
      'households.created',
      'households.member.upserted',
      'households.member.removed',
      'households.updated',
      'households.deleted',
    ])
  })
})
