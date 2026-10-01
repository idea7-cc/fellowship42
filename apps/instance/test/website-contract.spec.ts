import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createChurchSource,
  MAX_CURSOR_LENGTH,
  parseChurch,
  parseDescriptor,
  parsePage,
  verifySetupClaim,
  type ContractFetch,
  type ListResource,
} from '@fellowship42/website-contract'
import worker from '../worker'

const origin = 'https://app.example.test'
const website = 'https://www.example.test'
const setupSecret = 'website-setup-secret-that-is-long-enough'

async function call(
  path: string,
  init: RequestInit = {},
  bindings: Record<string, unknown> = {},
) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(
    new Request(origin + path, init) as Request<
      unknown,
      IncomingRequestCfProperties
    >,
    { ...env, ...bindings } as unknown as Env,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return response
}

async function json(path: string, init?: RequestInit) {
  const response = await call(path, init)
  return { response, body: (await response.json()) as unknown }
}

const sourceFetch: ContractFetch = async (url, init) =>
  call(new URL(url).pathname + new URL(url).search, {
    headers: init.headers,
  })

async function digest(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  )
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE churches SET status = 'published' WHERE id = 'church_demo'",
    ),
    env.DB.prepare(
      "DELETE FROM events WHERE id LIKE 'event_contract_%' OR id LIKE 'event_page_%'",
    ),
    env.DB.prepare("DELETE FROM sermons WHERE id LIKE 'sermon_page_%'"),
    env.DB.prepare("DELETE FROM groups WHERE id LIKE 'group_page_%'"),
    env.DB.prepare("DELETE FROM courses WHERE id LIKE 'course_page_%'"),
  ])
})

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

// Titles that are not Latin-1, that JSON escapes, or that are too long to fit
// in a cursor at all.
const pagingTitles = [
  'Men’s Breakfast',
  'Youth — Grades 6-12',
  '청년부',
  'Bible 📖',
  'Église',
  'Women’s Study',
  '聖書研究会',
  '"Quoted" \\ and\ttabbed',
  '청'.repeat(160),
  '\u0001'.repeat(160),
  '말씀'.repeat(150),
]
const longTitle = '말씀'.repeat(150)

async function pageAll(resource: ListResource, limit: number) {
  const source = createChurchSource({ url: origin, fetch: sourceFetch })
  const pages: { ids: string[]; nextCursor: string | null }[] = []
  let cursor: string | null = null
  do {
    const page: Awaited<ReturnType<typeof source.list>> = await source.list(
      resource,
      { cursor, limit },
    )
    if (!page.ok) throw new Error(`${resource} limit=${limit}: ${page.state}`)
    cursor = page.data.nextCursor
    pages.push({
      ids: page.data.items.map((item) => item.id),
      nextCursor: cursor,
    })
  } while (cursor && pages.length < 100)
  return pages
}

describe('public website contract v1', () => {
  it('describes the instance without reading identity', async () => {
    const { response, body } = await json('/api/website/v1', {
      headers: {
        // A forged staff credential must not change the public answer.
        'cf-access-jwt-assertion': 'not-a-jwt',
        cookie: '__Host-f42-session=forged',
      },
    })
    expect(response.status).toBe(200)
    const descriptor = parseDescriptor(body)
    expect(descriptor.site.status).toBe('published')
    expect(descriptor.church).toEqual({
      name: 'Fellowship Demo Church',
      slug: 'fellowship-demo',
    })
    expect(descriptor.origin).toBe(origin)
    expect(descriptor.instance.portableIdentitySha256).toBe(
      await digest('instance_42424242-1234-5678-9abc-123456789abc'),
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe(
      'cross-origin',
    )
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('returns an allowlisted church profile with absolute public image URLs', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR REPLACE INTO media (id, church_id, r2_key, media_type, content_type, byte_size, alt_text, visibility, created_at, updated_at)
         VALUES ('media_contract_logo', 'church_demo', 'contract/logo', 'image', 'image/png', 1, 'Church logo', 'public', 1, 1),
                ('media_contract_private', 'church_demo', 'contract/private', 'image', 'image/png', 1, 'Private', 'private', 1, 1)`,
      ),
      env.DB.prepare(
        "UPDATE church_profiles SET logo_media_id = 'media_contract_logo', cover_media_id = 'media_contract_private' WHERE church_id = 'church_demo'",
      ),
    ])
    const { response, body } = await json('/api/website/v1/church')
    expect(response.status).toBe(200)
    const { church } = parseChurch(body)
    expect(church.logo).toEqual({
      url: `${origin}/media/media_contract_logo`,
      alt: 'Church logo',
    })
    // A private image is never exposed, even when referenced.
    expect(church.cover).toBeNull()
    const raw = (body as { church: Record<string, unknown> }).church
    expect(Object.keys(raw).sort()).toEqual(
      [
        'address',
        'contact',
        'cover',
        'links',
        'logo',
        'name',
        'serviceTimes',
        'slug',
        'summary',
        'tagline',
        'theme',
        'timezone',
      ].sort(),
    )
    expect(JSON.stringify(raw)).not.toMatch(
      /draft|version|churchId|status|capacity/,
    )
  })

  it('hides every church resource while the website is unpublished', async () => {
    await env.DB.prepare(
      "UPDATE churches SET status = 'draft' WHERE id = 'church_demo'",
    ).run()
    const { body: descriptor } = await json('/api/website/v1')
    expect(parseDescriptor(descriptor)).toMatchObject({
      site: { status: 'unpublished' },
      church: null,
    })
    expect(JSON.stringify(descriptor)).not.toContain('Fellowship Demo')
    for (const path of ['church', 'events', 'sermons', 'groups', 'courses']) {
      const { response, body } = await json(`/api/website/v1/${path}`)
      expect(response.status).toBe(404)
      expect(body).toMatchObject({
        contract: 'fellowship42-website',
        error: { code: 'site_unpublished' },
      })
      expect(JSON.stringify(body)).not.toContain('Fellowship Demo')
    }
    const source = createChurchSource({ url: origin, fetch: sourceFetch })
    expect(await source.church()).toMatchObject({
      ok: false,
      state: 'unpublished',
    })
  })

  it('pages large lists without silent truncation', async () => {
    const now = Date.now()
    const statements = Array.from({ length: 230 }, (_, index) =>
      env.DB.prepare(
        `INSERT INTO sermons (id, church_id, slug, title, status, speaker, summary, preached_at, featured, created_at, updated_at)
         VALUES (?, 'church_demo', ?, ?, 'published', 'Speaker', '', ?, 0, ?, ?)`,
      ).bind(
        `sermon_page_${String(index).padStart(3, '0')}`,
        `page-sermon-${index}`,
        `Sermon ${index}`,
        // Ties on the sort key must still page deterministically.
        now - 86_400_000 * Math.floor(index / 3),
        now,
        now,
      ),
    )
    await env.DB.batch(statements)
    const { count } = (await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sermons WHERE church_id = 'church_demo' AND status = 'published' AND deleted_at IS NULL",
    ).first<{ count: number }>())!
    const source = createChurchSource({ url: origin, fetch: sourceFetch })
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const page: Awaited<ReturnType<typeof source.list<'sermons'>>> =
        await source.list('sermons', { cursor, limit: 100 })
      if (!page.ok) throw new Error(page.state)
      seen.push(...page.data.items.map((item) => item.id))
      cursor = page.data.nextCursor
      pages += 1
    } while (cursor && pages < 10)
    expect(seen).toHaveLength(count)
    expect(new Set(seen).size).toBe(count)
    expect(count).toBeGreaterThan(200)
    expect(pages).toBe(Math.ceil(count / 100))
  })

  it('pages groups and courses whose titles are not Latin-1 at every page size', async () => {
    const now = Date.now()
    await env.DB.batch(
      pagingTitles.flatMap((title, index) => [
        env.DB.prepare(
          `INSERT INTO groups (id, church_id, slug, title, status, group_type, featured, created_at, updated_at)
           VALUES (?, 'church_demo', ?, ?, 'published', 'small-group', ?, ?, ?)`,
        ).bind(
          `group_page_${index}`,
          `page-group-${index}`,
          title,
          index % 2,
          now,
          now,
        ),
        env.DB.prepare(
          `INSERT INTO courses (id, church_id, slug, title, status, course_type, delivery_mode, featured, created_at, updated_at)
           VALUES (?, 'church_demo', ?, ?, 'published', 'class', 'in-person', ?, ?, ?)`,
        ).bind(
          `course_page_${index}`,
          `page-course-${index}`,
          title,
          index % 2,
          now,
          now,
        ),
      ]),
    )
    for (const resource of ['groups', 'courses'] as const) {
      const [all] = await pageAll(resource, 100)
      const expected = all!.ids
      expect(expected.length).toBeGreaterThan(pagingTitles.length)
      for (let limit = 1; limit < expected.length; limit += 1) {
        const pages = await pageAll(resource, limit)
        expect(pages.flatMap((page) => page.ids)).toEqual(expected)
        expect(pages).toHaveLength(Math.ceil(expected.length / limit))
        for (const { nextCursor } of pages)
          expect(nextCursor?.length ?? 0).toBeLessThanOrEqual(MAX_CURSOR_LENGTH)
      }
      // A title too long for a cursor is looked up by id on the next request.
      const prefix = resource === 'groups' ? 'group_page_' : 'course_page_'
      const anchor = expected.indexOf(
        `${prefix}${pagingTitles.indexOf(longTitle)}`,
      )
      const [first, second] = await pageAll(resource, anchor + 1)
      expect(first!.ids.at(-1)).toBe(expected[anchor])
      expect(first!.nextCursor!.length).toBeLessThan(200)
      expect(second!.ids[0]).toBe(expected[anchor + 1])
    }
  })

  it('refuses a cursor issued by another route', async () => {
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO events (id, church_id, slug, title, status, summary, starts_at, ends_at, timezone, location, featured, created_at, updated_at)
       VALUES ('event_contract_a', 'church_demo', 'cursor-a', 'A', 'published', '', ?, NULL, 'UTC', 'Hall', 0, ?, ?),
              ('event_contract_b', 'church_demo', 'cursor-b', 'B', 'published', '', ?, NULL, 'UTC', 'Hall', 0, ?, ?)`,
    )
      .bind(now + 3_600_000, now, now, now + 7_200_000, now, now)
      .run()
    const cursors: Record<string, string> = {}
    for (const resource of ['events', 'sermons', 'groups', 'courses']) {
      const { body } = await json(`/api/website/v1/${resource}?limit=1`)
      const { nextCursor } = body as { nextCursor: string | null }
      expect(nextCursor).toEqual(expect.any(String))
      cursors[resource] = nextCursor!
      // The cursor works where it was issued.
      const next = await call(
        `/api/website/v1/${resource}?limit=1&cursor=${nextCursor}`,
      )
      expect(next.status).toBe(200)
      await next.arrayBuffer()
    }
    // Events and sermons share a key shape, as do groups and courses.
    for (const [issuer, route] of [
      ['sermons', 'events'],
      ['events', 'sermons'],
      ['groups', 'courses'],
      ['courses', 'groups'],
    ] as const) {
      const { response, body } = await json(
        `/api/website/v1/${route}?cursor=${cursors[issuer]}`,
      )
      expect(response.status).toBe(400)
      expect(body).toMatchObject({
        contract: 'fellowship42-website',
        error: { code: 'invalid_cursor' },
      })
    }
    const untagged = base64Url(
      new TextEncoder().encode(JSON.stringify([1, 'Title', 'group_x'])),
    )
    const badUtf8 = base64Url(new Uint8Array([0x5b, 0x22, 0xff, 0xfe]))
    const tooLong = 'A'.repeat(MAX_CURSOR_LENGTH + 1)
    for (const cursor of [untagged, badUtf8, tooLong]) {
      const { response } = await json(`/api/website/v1/groups?cursor=${cursor}`)
      expect(response.status).toBe(400)
    }
    expect(
      await createChurchSource({ url: origin, fetch: sourceFetch }).list(
        'events',
        { cursor: cursors.sermons },
      ),
    ).toMatchObject({ ok: false, state: 'invalid-request' })
  })

  it('keeps an event listed while it is in progress and serves UTC instants with its zone', async () => {
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO events (id, church_id, slug, title, status, summary, starts_at, ends_at, timezone, location, featured, created_at, updated_at)
         VALUES ('event_contract_live', 'church_demo', 'live-now', 'Live now', 'published', '', ?, ?, 'Asia/Kolkata', 'Hall', 0, ?, ?),
                ('event_contract_over', 'church_demo', 'over', 'Over', 'published', '', ?, ?, 'America/New_York', 'Hall', 0, ?, ?),
                ('event_contract_draft', 'church_demo', 'draft', 'Draft', 'draft', '', ?, NULL, 'America/New_York', 'Hall', 0, ?, ?)`,
      ).bind(
        now - 3_600_000,
        now + 3_600_000,
        now,
        now,
        now - 7_200_000,
        now - 3_600_000,
        now,
        now,
        now + 3_600_000,
        now,
        now,
      ),
    ])
    const { body } = await json('/api/website/v1/events?limit=100')
    const page = parsePage('events', body)
    const ids = page.items.map((item) => item.id)
    expect(ids).toContain('event_contract_live')
    expect(ids).not.toContain('event_contract_over')
    expect(ids).not.toContain('event_contract_draft')
    const live = page.items.find((item) => item.id === 'event_contract_live')!
    expect(live.timezone).toBe('Asia/Kolkata')
    expect(live.startsAt).toBe(new Date(now - 3_600_000).toISOString())
  })

  it('removes withdrawn and deleted records on the next request', async () => {
    const before = parsePage(
      'groups',
      (await json('/api/website/v1/groups?limit=100')).body,
    )
    expect(before.items.map((item) => item.id)).toContain('group_demo_midtown')
    await env.DB.prepare(
      "UPDATE groups SET status = 'draft' WHERE id = 'group_demo_midtown'",
    ).run()
    const withdrawn = parsePage(
      'groups',
      (await json('/api/website/v1/groups?limit=100')).body,
    )
    expect(withdrawn.items.map((item) => item.id)).not.toContain(
      'group_demo_midtown',
    )
    await env.DB.prepare(
      "UPDATE groups SET status = 'published', deleted_at = 1 WHERE id = 'group_demo_midtown'",
    ).run()
    const deleted = parsePage(
      'groups',
      (await json('/api/website/v1/groups?limit=100')).body,
    )
    expect(deleted.items.map((item) => item.id)).not.toContain(
      'group_demo_midtown',
    )
    await env.DB.prepare(
      "UPDATE groups SET deleted_at = NULL WHERE id = 'group_demo_midtown'",
    ).run()
  })

  it('links courses to their public page on the instance origin', async () => {
    const page = parsePage(
      'courses',
      (await json('/api/website/v1/courses?limit=100')).body,
    )
    const course = page.items.find((item) => item.slug === 'baptism-class')!
    expect(course.url).toBe(`${origin}/courses/baptism-class`)
    const detail = await call('/api/churches/church_demo/courses/baptism-class')
    expect(detail.status).toBe(200)
  })

  it('rejects malformed limits and cursors with contract errors', async () => {
    const limit = await json('/api/website/v1/events?limit=500')
    expect(limit.response.status).toBe(400)
    expect(limit.body).toMatchObject({ error: { code: 'invalid_limit' } })
    const cursor = await json('/api/website/v1/sermons?cursor=bm90LWpzb24')
    expect(cursor.response.status).toBe(400)
    expect(cursor.body).toMatchObject({ error: { code: 'invalid_cursor' } })
  })

  it('answers preflight requests for browser consumers', async () => {
    const response = await call('/api/website/v1/events', {
      method: 'OPTIONS',
      headers: {
        Origin: website,
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

describe('public media for other origins', () => {
  beforeEach(async () => {
    await env.MEDIA.put('contract/logo', 'logo-bytes', {
      httpMetadata: { contentType: 'image/png' },
    })
    await env.DB.prepare(
      `INSERT OR REPLACE INTO media (id, church_id, r2_key, media_type, content_type, byte_size, alt_text, visibility, created_at, updated_at)
       VALUES ('media_contract_logo', 'church_demo', 'contract/logo', 'image', 'image/png', 10, 'Church logo', 'public', 1, 1)`,
    ).run()
  })

  it('serves a full response, embeddable cross-origin', async () => {
    const response = await call('/media/media_contract_logo')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Range')).toBeNull()
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe(
      'cross-origin',
    )
    expect(await response.text()).toBe('logo-bytes')
  })

  it('revalidates with 304 and still honours ranges', async () => {
    const first = await call('/media/media_contract_logo')
    const etag = first.headers.get('ETag')!
    await first.arrayBuffer()
    const revalidated = await call('/media/media_contract_logo', {
      headers: { 'If-None-Match': etag },
    })
    expect(revalidated.status).toBe(304)
    const failedMatch = await call('/media/media_contract_logo', {
      headers: { 'If-Match': '"something-else"' },
    })
    expect(failedMatch.status).toBe(412)
    const range = await call('/media/media_contract_logo', {
      headers: { Range: 'bytes=0-3' },
    })
    expect(range.status).toBe(206)
    expect(await range.text()).toBe('logo')
  })

  it('keeps private app responses same-origin', async () => {
    const response = await call('/api/site')
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe(
      'same-origin',
    )
  })
})

describe('instance front door and website setup', () => {
  it('serves its own homepage, with security headers, when no website is configured', async () => {
    const response = await call('/', {}, { WEBSITE_ORIGIN: '' })
    expect(response.status).toBeLessThan(500)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Location')).toBeNull()
    await response.arrayBuffer()
  })

  it('redirects the homepage to the configured website', async () => {
    const response = await call(
      '/',
      { redirect: 'manual' },
      { WEBSITE_ORIGIN: `${website}/` },
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(website)
  })

  it('issues setup claims only to owners and only when configured', async () => {
    const anonymous = await call(
      '/api/website-setup/church_demo/claim',
      { method: 'POST', headers: { Origin: origin } },
      { WEBSITE_ORIGIN: website, WEBSITE_SETUP_SECRET: setupSecret },
    )
    expect(anonymous.status).toBe(401)
    const token = await ownerSession()
    const unconfigured = await call(
      '/api/website-setup/church_demo/claim',
      {
        method: 'POST',
        headers: { Origin: origin, cookie: `__Host-f42-session=${token}` },
      },
      // Blank the secret explicitly: a local .dev.vars may define it.
      {
        SIGN_IN_ORIGIN: origin,
        WEBSITE_ORIGIN: website,
        WEBSITE_SETUP_SECRET: '',
      },
    )
    expect(unconfigured.status).toBe(409)
    const issued = await call(
      '/api/website-setup/church_demo/claim',
      {
        method: 'POST',
        headers: { Origin: origin, cookie: `__Host-f42-session=${token}` },
      },
      {
        SIGN_IN_ORIGIN: origin,
        WEBSITE_ORIGIN: website,
        WEBSITE_SETUP_SECRET: setupSecret,
      },
    )
    expect(issued.status).toBe(200)
    const { url } = (await issued.json()) as { url: string }
    expect(url.startsWith(`${website}/fellowship42/setup#claim=`)).toBe(true)
    const claim = await verifySetupClaim(setupSecret, url.split('#claim=')[1], {
      audience: website,
    })
    expect(claim?.sub).toBe('user_demo_owner')
    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'website.setup_claim_issued'",
    ).first<{ count: number }>()
    expect(audit?.count).toBeGreaterThan(0)
  })

  it('refuses setup claims to staff without owner authority', async () => {
    const token = await sessionFor('user_contract_leader', 'ministry-leader')
    const response = await call(
      '/api/website-setup/church_demo/claim',
      {
        method: 'POST',
        headers: { Origin: origin, cookie: `__Host-f42-session=${token}` },
      },
      {
        SIGN_IN_ORIGIN: origin,
        WEBSITE_ORIGIN: website,
        WEBSITE_SETUP_SECRET: setupSecret,
      },
    )
    expect(response.status).toBe(403)
  })
})

async function sessionToken(userId: string) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO auth_identities (id, user_id, provider, subject, created_at, updated_at) VALUES (?, ?, 'passkey', ?, 1, 1)",
  )
    .bind(`identity_${userId}`, userId, userId)
    .run()
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  await env.DB.prepare(
    'INSERT INTO local_auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(await digest(token), userId, Date.now() + 3_600_000)
    .run()
  return token
}

function ownerSession() {
  return sessionToken('user_demo_owner')
}

async function sessionFor(userId: string, roleKey: string) {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, first_name, last_name, status, created_at, updated_at)
       VALUES (?, ?, 'Contract', 'Leader', 'active', ?, ?)`,
    ).bind(userId, `${userId}@example.test`, now, now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO church_memberships (id, church_id, user_id, status, joined_at, created_at, updated_at)
       VALUES (?, 'church_demo', ?, 'active', ?, ?, ?)`,
    ).bind(`membership_${userId}`, userId, now, now, now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO membership_roles (church_id, membership_id, role_id, assigned_at)
       SELECT 'church_demo', ?, id, ? FROM roles WHERE church_id = 'church_demo' AND key = ?`,
    ).bind(`membership_${userId}`, now, roleKey),
  ])
  return sessionToken(userId)
}
