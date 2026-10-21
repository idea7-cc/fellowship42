import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  Contribution,
  GroupSession,
  Household,
  MediaRecord,
  Person,
} from '../src/lib/api-types'
import type { AccessIdentity } from '../worker/lib/auth'
import { AppError } from '../worker/lib/errors'
import { contributionRoutes } from '../worker/routes/contributions'
import { groupRoutes } from '../worker/routes/groups'
import { householdRoutes } from '../worker/routes/households'
import { mediaManagementRoutes } from '../worker/routes/media'
import { peopleRoutes } from '../worker/routes/people'

/*
 * A create whose response is lost leaves the client unsure whether it was
 * saved. Retrying with the same Idempotency-Key must return the original
 * record instead of creating a second one, and must not add audit or outbox
 * evidence a second time.
 */

const owner: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'demo-owner-access-subject',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} as unknown as ExecutionContext

const app = new Hono<{
  Bindings: Env
  Variables: { identity: AccessIdentity | null; requestId: string }
}>()
app.use('*', async (c, next) => {
  c.set('identity', owner)
  c.set('requestId', 'request_create_retry_test')
  await next()
})
app.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 500
  return c.json(
    {
      error: {
        code: error instanceof AppError ? error.code : 'internal_error',
        message:
          error instanceof HTTPException
            ? error.message
            : 'Internal server error',
      },
    },
    status,
  )
})
app.route('/api/contributions', contributionRoutes)
app.route('/api/people', peopleRoutes)
app.route('/api/households', householdRoutes)
app.route('/api/groups', groupRoutes)
app.route('/api/media', mediaManagementRoutes)

async function post(path: string, body: unknown, key?: string) {
  return app.fetch(
    new Request(`https://fellowship42.test${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    executionContext,
  )
}

async function upload(
  bytes: string,
  key?: string,
  altText = 'Bulletin',
  bindings: Env = env,
) {
  return app.fetch(
    new Request(
      `https://fellowship42.test/api/media/church_demo?${new URLSearchParams({ visibility: 'private', altText })}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          ...(key ? { 'idempotency-key': key } : {}),
        },
        body: new TextEncoder().encode(bytes),
      },
    ),
    bindings,
    executionContext,
  )
}

/**
 * The Worker's bindings with the media bucket's `put` observed. `beforePut`
 * runs after the Worker decides to store bytes and before they are stored,
 * which is where a concurrent twin request can overtake this one.
 */
function watchMediaPuts(beforePut?: (key: string) => Promise<void>) {
  const puts: string[] = []
  const bucket = new Proxy(env.MEDIA, {
    get(target, property) {
      if (property === 'put') {
        return async (
          key: string,
          ...rest: [Parameters<R2Bucket['put']>[1], R2PutOptions?]
        ) => {
          puts.push(key)
          await beforePut?.(key)
          return target.put(key, ...rest)
        }
      }
      const value: unknown = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const bindings = Object.assign(Object.create(env) as Env, { MEDIA: bucket })
  return { puts, bindings }
}

async function count(sql: string, ...bindings: unknown[]) {
  const row = await env.DB.prepare(sql)
    .bind(...bindings)
    .first<{ total: number }>()
  return row?.total ?? 0
}

async function evidenceCount(action: string, entityId: string) {
  return {
    audit: await count(
      'SELECT COUNT(*) AS total FROM audit_events WHERE action = ? AND entity_id = ?',
      action,
      entityId,
    ),
    outbox: await count(
      'SELECT COUNT(*) AS total FROM outbox_events WHERE topic = ? AND aggregate_id = ?',
      action,
      entityId,
    ),
  }
}

async function r2ObjectCount() {
  const listed = await env.MEDIA.list({ prefix: 'churches/church_demo/media/' })
  return listed.objects.length
}

beforeEach(async () => {
  const now = Date.now()
  await env.DB.prepare(
    `
      INSERT OR IGNORE INTO auth_identities (
        id, user_id, provider, subject, email_at_provider, created_at, updated_at
      ) VALUES ('identity_demo_owner', 'user_demo_owner', ?, ?, ?, ?, ?)
    `,
  )
    .bind(owner.provider, owner.subject, owner.email, now, now)
    .run()
})

describe('contribution retries', () => {
  const gift = {
    donorName: 'Retry Donor',
    amountMinor: 5_000,
    currency: 'USD',
    fund: 'General',
    paymentMethod: 'cash',
    recurring: false,
    donatedAt: '2026-09-20T15:00:00.000Z',
  }

  it('records one contribution, one audit row, and one outbox row for a retried entry', async () => {
    // The Worker already deduplicated a sequential retry with the same key;
    // the lost-response defect was in the staff form (see the DOM tests). This
    // pins that contract together with the `replayed` flag.
    const first = await post(
      '/api/contributions/church_demo',
      gift,
      'entry-contribution-01',
    )
    const second = await post(
      '/api/contributions/church_demo',
      gift,
      'entry-contribution-01',
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json<{
      contribution: Contribution
      replayed: boolean
    }>()
    const secondBody = await second.json<{
      contribution: Contribution
      replayed: boolean
    }>()
    expect(secondBody.contribution.id).toBe(firstBody.contribution.id)
    expect(firstBody.replayed).toBe(false)
    expect(secondBody.replayed).toBe(true)
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM contributions WHERE donor_name = ?',
        'Retry Donor',
      ),
    ).toBe(1)
    expect(
      await evidenceCount('contributions.created', firstBody.contribution.id),
    ).toEqual({ audit: 1, outbox: 1 })
  })

  it('treats an equivalent body as the same request', async () => {
    const first = await post(
      '/api/contributions/church_demo',
      { ...gift, donorName: 'Equivalent Donor' },
      'entry-contribution-02',
    )
    expect(first.status).toBe(201)
    // Same meaning: explicit null person, reordered keys, and the same instant
    // written with a different offset.
    const { donatedAt: _donatedAt, ...rest } = gift
    const retry = await post(
      '/api/contributions/church_demo',
      {
        donatedAt: '2026-09-20T10:00:00.000-05:00',
        personId: null,
        ...rest,
        donorName: 'Equivalent Donor',
      },
      'entry-contribution-02',
    )
    expect(retry.status).toBe(201)
    expect((await retry.json<{ replayed: boolean }>()).replayed).toBe(true)
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM contributions WHERE donor_name = ?',
        'Equivalent Donor',
      ),
    ).toBe(1)
  })

  it('rejects a key reused for a different contribution without recording it', async () => {
    await post(
      '/api/contributions/church_demo',
      { ...gift, donorName: 'Conflict Donor' },
      'entry-contribution-03',
    )
    const conflict = await post(
      '/api/contributions/church_demo',
      { ...gift, donorName: 'Conflict Donor', amountMinor: 9_999 },
      'entry-contribution-03',
    )
    expect(conflict.status).toBe(409)
    expect(
      (await conflict.json<{ error: { code: string } }>()).error.code,
    ).toBe('idempotency_key_conflict')
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM contributions WHERE donor_name = ?',
        'Conflict Donor',
      ),
    ).toBe(1)
  })

  it('keeps identical gifts entered separately as separate contributions', async () => {
    for (const key of ['entry-contribution-04', 'entry-contribution-05']) {
      const response = await post(
        '/api/contributions/church_demo',
        { ...gift, donorName: 'Twice Donor' },
        key,
      )
      expect(response.status).toBe(201)
    }
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM contributions WHERE donor_name = ?',
        'Twice Donor',
      ),
    ).toBe(2)
  })

  it('answers a key row without an outcome with a retryable conflict (defensive)', async () => {
    const input = { ...gift, donorName: 'Pending Donor' }
    const first = await post(
      '/api/contributions/church_demo',
      input,
      'entry-contribution-06',
    )
    expect(first.status).toBe(201)
    // No code path stores a key without its outcome: commitOnce writes both
    // in one row in the record's batch. Only manual data repair could leave
    // this state, and it must still never read as success or a server error.
    await env.DB.prepare(
      `UPDATE idempotency_keys SET response_json = NULL, response_status = NULL WHERE key = 'entry-contribution-06'`,
    ).run()
    const response = await post(
      '/api/contributions/church_demo',
      input,
      'entry-contribution-06',
    )
    expect(response.status).toBe(409)
    expect(
      (await response.json<{ error: { code: string } }>()).error.code,
    ).toBe('idempotency_in_progress')
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM contributions WHERE donor_name = ?',
        'Pending Donor',
      ),
    ).toBe(1)
  })

  it('rejects a malformed key before recording anything', async () => {
    const response = await post(
      '/api/contributions/church_demo',
      { ...gift, donorName: 'Short Key Donor' },
      'short',
    )
    expect(response.status).toBe(422)
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM contributions WHERE donor_name = ?',
        'Short Key Donor',
      ),
    ).toBe(0)
  })
})

describe('directory create retries', () => {
  it('creates one person without an email when the entry is retried', async () => {
    const input = { firstName: 'Retry', lastName: 'Visitor' }
    const first = await post(
      '/api/people/church_demo',
      input,
      'entry-person-01',
    )
    const second = await post(
      '/api/people/church_demo',
      input,
      'entry-person-01',
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json<{ person: Person; replayed: boolean }>()
    const secondBody = await second.json<{
      person: Person
      replayed: boolean
    }>()
    expect(secondBody.person.id).toBe(firstBody.person.id)
    expect([firstBody.replayed, secondBody.replayed]).toEqual([false, true])
    expect(
      await count(
        `SELECT COUNT(*) AS total FROM people WHERE first_name = 'Retry' AND last_name = 'Visitor'`,
      ),
    ).toBe(1)
    expect(await evidenceCount('people.created', firstBody.person.id)).toEqual({
      audit: 1,
      outbox: 1,
    })
  })

  it('replays a person with an email instead of reporting a duplicate email', async () => {
    const input = {
      firstName: 'Retry',
      lastName: 'Emailer',
      email: 'retry.emailer@example.test',
    }
    const first = await post(
      '/api/people/church_demo',
      input,
      'entry-person-02',
    )
    const second = await post(
      '/api/people/church_demo',
      input,
      'entry-person-02',
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect((await second.json<{ person: Person }>()).person.id).toBe(
      (await first.json<{ person: Person }>()).person.id,
    )
  })

  it('refuses to reuse a person entry key for different details', async () => {
    await post(
      '/api/people/church_demo',
      { firstName: 'Keyed', lastName: 'Once' },
      'entry-person-03',
    )
    const conflict = await post(
      '/api/people/church_demo',
      { firstName: 'Keyed', lastName: 'Twice' },
      'entry-person-03',
    )
    expect(conflict.status).toBe(409)
    expect(
      await count(
        `SELECT COUNT(*) AS total FROM people WHERE first_name = 'Keyed'`,
      ),
    ).toBe(1)
  })

  it('creates one household when the entry is retried', async () => {
    const input = { name: 'Retry Household', city: 'Austin' }
    const first = await post(
      '/api/households/church_demo',
      input,
      'entry-household-01',
    )
    const second = await post(
      '/api/households/church_demo',
      input,
      'entry-household-01',
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json<{
      household: Household
      replayed: boolean
    }>()
    const secondBody = await second.json<{
      household: Household
      replayed: boolean
    }>()
    expect(secondBody.household.id).toBe(firstBody.household.id)
    expect(secondBody.replayed).toBe(true)
    expect(
      await count(
        `SELECT COUNT(*) AS total FROM households WHERE name = 'Retry Household'`,
      ),
    ).toBe(1)
    expect(
      await evidenceCount('households.created', firstBody.household.id),
    ).toEqual({ audit: 1, outbox: 1 })
  })
})

describe('group session create retries', () => {
  it('creates one session when the entry is retried and rejects the key on another group', async () => {
    const group = await post('/api/groups/church_demo', {
      slug: 'retry-session-group',
      title: 'Retry Session Group',
      groupType: 'small-group',
    })
    expect(group.status).toBe(201)
    const groupId = (await group.json<{ group: { id: string } }>()).group.id
    const input = {
      title: 'Retry night',
      startsAt: Date.UTC(2026, 8, 24, 23),
      status: 'planned',
    }
    const first = await post(
      `/api/groups/church_demo/${groupId}/sessions`,
      input,
      'entry-session-01',
    )
    const second = await post(
      `/api/groups/church_demo/${groupId}/sessions`,
      input,
      'entry-session-01',
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const secondBody = await second.json<{
      sessions: GroupSession[]
      replayed: boolean
    }>()
    expect(secondBody.replayed).toBe(true)
    expect(secondBody.sessions.map((session) => session.title)).toEqual([
      'Retry night',
    ])
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM group_sessions WHERE group_id = ?',
        groupId,
      ),
    ).toBe(1)
    expect(
      await count(
        `SELECT COUNT(*) AS total FROM audit_events WHERE action = 'groups.session.created' AND entity_id = ?`,
        groupId,
      ),
    ).toBe(1)

    const otherGroup = await post('/api/groups/church_demo', {
      slug: 'retry-session-other',
      title: 'Retry Session Other',
      groupType: 'small-group',
    })
    const otherId = (await otherGroup.json<{ group: { id: string } }>()).group
      .id
    const misdirected = await post(
      `/api/groups/church_demo/${otherId}/sessions`,
      input,
      'entry-session-01',
    )
    expect(misdirected.status).toBe(409)
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM group_sessions WHERE group_id = ?',
        otherId,
      ),
    ).toBe(0)
  })
})

describe('media upload retries', () => {
  it('stores one media record and one object when an upload is retried', async () => {
    const objectsBefore = await r2ObjectCount()
    const first = await upload('retry-image-bytes', 'entry-media-01')
    const second = await upload('retry-image-bytes', 'entry-media-01')
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json<{
      media: MediaRecord
      replayed: boolean
    }>()
    const secondBody = await second.json<{
      media: MediaRecord
      replayed: boolean
    }>()
    expect(secondBody.media.id).toBe(firstBody.media.id)
    expect([firstBody.replayed, secondBody.replayed]).toEqual([false, true])
    expect(await r2ObjectCount()).toBe(objectsBefore + 1)
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM media WHERE checksum = ?',
        firstBody.media.checksum,
      ),
    ).toBe(1)
    expect(await evidenceCount('media.created', firstBody.media.id)).toEqual({
      audit: 1,
      outbox: 1,
    })
  })

  it('refuses different bytes under the same key without storing them', async () => {
    const first = await upload('first-upload-bytes', 'entry-media-02')
    expect(first.status).toBe(201)
    const objectsBefore = await r2ObjectCount()
    const conflict = await upload('other-upload-bytes', 'entry-media-02')
    expect(conflict.status).toBe(409)
    expect(await r2ObjectCount()).toBe(objectsBefore)
  })

  it('checks the key before storing any bytes', async () => {
    const watched = watchMediaPuts()
    const first = await upload(
      'checked-first-bytes',
      'entry-media-03',
      'Bulletin',
      watched.bindings,
    )
    expect(first.status).toBe(201)
    expect(watched.puts).toHaveLength(1)

    const replay = await upload(
      'checked-first-bytes',
      'entry-media-03',
      'Bulletin',
      watched.bindings,
    )
    expect(replay.status).toBe(201)
    expect((await replay.json<{ replayed: boolean }>()).replayed).toBe(true)
    const conflict = await upload(
      'checked-other-bytes',
      'entry-media-03',
      'Bulletin',
      watched.bindings,
    )
    expect(conflict.status).toBe(409)
    // Neither the replay nor the refused upload reached R2.
    expect(watched.puts).toHaveLength(1)
  })

  it('removes its own object when a concurrent twin records the key first', async () => {
    const original = await upload('twin-upload-bytes', 'entry-media-04')
    expect(original.status).toBe(201)
    const { media } = await original.json<{ media: MediaRecord }>()
    // While this attempt stores its bytes, a twin with the same key and
    // details commits first; its key row names the media it created.
    const watched = watchMediaPuts(async () => {
      await env.DB.prepare(
        `
          INSERT INTO idempotency_keys (
            scope, key, request_hash, response_status, response_json,
            created_at, expires_at
          )
          SELECT scope, 'entry-media-05', request_hash, response_status,
                 response_json, created_at, expires_at
          FROM idempotency_keys WHERE key = 'entry-media-04'
        `,
      ).run()
    })
    const objectsBefore = await r2ObjectCount()
    const late = await upload(
      'twin-upload-bytes',
      'entry-media-05',
      'Bulletin',
      watched.bindings,
    )
    expect(late.status).toBe(201)
    const lateBody = await late.json<{
      media: MediaRecord
      replayed: boolean
    }>()
    expect(lateBody).toMatchObject({ replayed: true, media: { id: media.id } })
    expect(watched.puts).toHaveLength(1)
    expect(await env.MEDIA.head(watched.puts[0]!)).toBeNull()
    expect(await r2ObjectCount()).toBe(objectsBefore)
    expect(
      await count(
        'SELECT COUNT(*) AS total FROM media WHERE checksum = ?',
        media.checksum,
      ),
    ).toBe(1)
  })
})
