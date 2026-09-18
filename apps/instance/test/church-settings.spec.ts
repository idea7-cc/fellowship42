import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ChurchSettings, ChurchSite } from '../contracts/church-settings'
import type { AccessIdentity } from '../worker/lib/auth'
import { AppError } from '../worker/lib/errors'
import {
  churchSettingsRoutes,
  siteRoutes,
} from '../worker/features/church/routes'
import { mediaManagementRoutes, mediaRoutes } from '../worker/routes/media'
import { churchRoutes } from '../worker/routes/churches'
import { mutateChurch } from '../worker/features/church/service'
import { bootstrapInstance } from '../worker/routes/bootstrap'

const owner: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'settings-owner',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}
const other: AccessIdentity = {
  ...owner,
  subject: 'settings-outsider',
  email: 'outsider@example.test',
}
function request(
  identity: AccessIdentity | null,
  path: string,
  body?: unknown,
  method = body ? 'POST' : 'GET',
) {
  const app = new Hono<{
    Bindings: Env
    Variables: { identity: AccessIdentity | null; requestId: string }
  }>()
  app.use('*', async (c, next) => {
    c.set('identity', identity)
    c.set('requestId', 'settings-test')
    await next()
  })
  app.onError((error, c) =>
    c.json(
      {
        error: {
          code: error instanceof AppError ? error.code : 'internal_error',
          message: error.message,
        },
      },
      error instanceof HTTPException ? error.status : 500,
    ),
  )
  app.route('/api/church-settings', churchSettingsRoutes)
  app.route('/api/site', siteRoutes)
  app.route('/api/churches', churchRoutes)
  app.route('/api/media', mediaManagementRoutes)
  app.route('/media', mediaRoutes)
  return app.fetch(
    new Request(`https://example.test${path}`, {
      method,
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    }),
    env,
    {
      waitUntil() {},
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext,
  )
}
const base = '/api/church-settings/church_demo'
async function settings() {
  const response = await request(owner, base)
  expect(response.status).toBe(200)
  return response.json<ChurchSettings>()
}
async function outboxEvidence() {
  return (await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM outbox_events WHERE aggregate_type = 'church' AND topic LIKE 'church.%'",
  ).first<{ total: number }>())!.total
}
async function evidence() {
  return (await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM audit_events WHERE entity_type = 'church' AND action LIKE 'church.%'",
  ).first<{ total: number }>())!.total
}
beforeEach(async () => {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO auth_identities (id,user_id,provider,subject,email_at_provider,created_at,updated_at) VALUES ('settings-owner','user_demo_owner',?,?,?,1,1)`,
  )
    .bind(owner.provider, owner.subject, owner.email)
    .run()
})

describe('church settings and publication', () => {
  it('denies anonymous and unassigned reads, previews, image reads, and mutations', async () => {
    const count = await evidence()
    for (const identity of [null, other])
      for (const path of [
        base,
        `${base}/preview`,
        `${base}/images`,
        `${base}/images/image`,
        `${base}/save`,
      ]) {
        const response = await request(
          identity,
          path,
          path.endsWith('save') ? {} : undefined,
        )
        expect([401, 403]).toContain(response.status)
      }
    expect(await evidence()).toBe(count)
  })
  it('keeps saved drafts private, publishes atomically, and unpublishes without losing content', async () => {
    const initial = await settings()
    const before = await (await request(null, '/api/site')).json<ChurchSite>()
    const draft = {
      ...initial.draft,
      name: 'A quieter church',
      summary: 'Everyone is welcome.',
      serviceTimes: [{ label: 'Sunday worship', day: 0, time: '09:30' }],
    }
    const saved = await (
      await request(owner, `${base}/save`, { version: initial.version, draft })
    ).json<ChurchSettings>()
    expect(saved.hasDraft).toBe(true)
    expect(
      (await (await request(null, '/api/site')).json<ChurchSite>()).church.name,
    ).toBe(before.church.name)
    expect(
      (await (await request(owner, `${base}/preview`)).json<ChurchSite>())
        .church.name,
    ).toBe(draft.name)
    const published = await (
      await request(owner, `${base}/publish`, { version: saved.version })
    ).json<ChurchSettings>()
    expect(published).toMatchObject({
      published: true,
      hasDraft: false,
      version: saved.version + 1,
    })
    const live = await (await request(null, '/api/site')).json<ChurchSite>()
    expect(live.church.name).toBe(draft.name)
    expect(live.church.serviceTimes[0]).toMatchObject(draft.serviceTimes[0])
    expect(JSON.stringify(live)).not.toContain('draft_json')
    const hidden = await request(owner, `${base}/unpublish`, {
      version: published.version,
    })
    expect(hidden.status).toBe(200)
    expect((await request(null, '/api/site')).status).toBe(404)
    expect(
      (await request(null, '/api/churches/church_demo/groups')).status,
    ).toBe(401)
    expect((await settings()).draft.summary).toBe(draft.summary)
  })
  it('rejects unsafe links, invalid timezones, times, and foreign media without evidence', async () => {
    const initial = await settings()
    const count = await evidence()
    for (const patch of [
      { websiteUrl: 'javascript:alert(1)' },
      { timezone: 'Invalid/Timezone' },
      { serviceTimes: [{ label: 'Service', day: 8, time: '25:90' }] },
      { coverMediaId: 'foreign-image' },
    ]) {
      expect(
        (
          await request(owner, `${base}/save`, {
            version: initial.version,
            draft: { ...initial.draft, ...patch },
          })
        ).status,
      ).toBe(422)
    }
    expect(await evidence()).toBe(count)
    expect((await settings()).version).toBe(initial.version)
  })
  it('accepts only one competing save and creates one audit and outbox event', async () => {
    const initial = await settings()
    const count = await evidence()
    const outboxCount = await outboxEvidence()
    const results = await Promise.all(
      ['One', 'Two'].map((tagline) =>
        request(owner, `${base}/save`, {
          version: initial.version,
          draft: { ...initial.draft, tagline },
        }),
      ),
    )
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ])
    expect(await evidence()).toBe(count + 1)
    expect(await outboxEvidence()).toBe(outboxCount + 1)
    const stored = await settings()
    expect(stored.version).toBe(initial.version + 1)
    expect(
      (await request(owner, `${base}/publish`, { version: initial.version }))
        .status,
    ).toBe(409)
    expect(await evidence()).toBe(count + 1)
    expect(await outboxEvidence()).toBe(outboxCount + 1)
  })
  it('keeps selected images private until publish and protects published image references', async () => {
    const id = `image_${crypto.randomUUID()}`
    await env.DB.prepare(
      `INSERT INTO media (id,church_id,r2_key,media_type,content_type,byte_size,alt_text,visibility,created_at,updated_at) VALUES (?,'church_demo',?,'image','image/png',3,'Logo','private',1,1)`,
    )
      .bind(id, id)
      .run()
    await env.MEDIA.put(id, new Uint8Array([1, 2, 3]))
    const initial = await settings()
    const saved = await (
      await request(owner, `${base}/save`, {
        version: initial.version,
        draft: { ...initial.draft, logoMediaId: id },
      })
    ).json<ChurchSettings>()
    expect((await request(null, `/media/${id}`)).status).toBe(404)
    const preview = await request(owner, `${base}/images/${id}`)
    expect(preview.status).toBe(200)
    expect(preview.headers.get('cache-control')).toBe('private, no-store')
    expect(
      (await request(owner, `${base}/publish`, { version: saved.version }))
        .status,
    ).toBe(200)
    expect((await request(null, `/media/${id}`)).ok).toBe(true)
    expect(
      (
        await request(
          owner,
          `/api/media/church_demo/${id}`,
          { version: 2 },
          'DELETE',
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await request(
          owner,
          `/api/media/church_demo/${id}`,
          { version: 2, visibility: 'private' },
          'PATCH',
        )
      ).status,
    ).toBe(409)
  })
  it('does not expose draft ministry content through the site or preview', async () => {
    await env.DB.prepare(
      `INSERT INTO groups (id,church_id,slug,title,status,group_type,created_at,updated_at) VALUES ('settings-private-group','church_demo','settings-private','Never public','draft','group',1,1)`,
    ).run()
    for (const path of ['/api/site', `${base}/preview`]) {
      const response = await request(owner, path)
      expect(response.status).toBe(200)
      expect(await response.text()).not.toContain('Never public')
    }
  })
  it('supports a freshly bootstrapped church without seed profile or service rows', async () => {
    await env.DB.prepare('DELETE FROM instance_metadata').run()
    const created = await bootstrapInstance(
      env.DB,
      owner,
      owner.email,
      'instance_42424242-1234-5678-9abc-123456789abc',
      {
        name: 'Fresh Church',
        slug: 'fresh-church',
        timezone: 'America/New_York',
        locale: 'en-US',
        countryCode: 'US',
      },
      'fresh-setup',
    )
    const path = `/api/church-settings/${created.instance.churchId}`
    const initial = await (await request(owner, path)).json<ChurchSettings>()
    expect(initial).toMatchObject({
      published: false,
      readiness: { profile: false, services: false, content: false },
    })
    expect((await request(null, '/api/site')).status).toBe(404)
    const saved = await (
      await request(owner, `${path}/save`, {
        version: initial.version,
        draft: {
          ...initial.draft,
          summary: 'Welcome to our church.',
          serviceTimes: [{ label: 'Worship', day: 0, time: '10:00' }],
        },
      })
    ).json<ChurchSettings>()
    expect(
      (await request(owner, `${path}/publish`, { version: saved.version }))
        .status,
    ).toBe(200)
    expect(
      (await (await request(null, '/api/site')).json<ChurchSite>()).church.name,
    ).toBe('Fresh Church')
  })
})

it('restores a human draft replaced by an agent without changing publication or leaking review data', async () => {
  const original = await settings()
  const human = await (
    await request(owner, `${base}/save`, {
      version: original.version,
      draft: { ...original.draft, tagline: 'Human draft' },
    })
  ).json<ChurchSettings>()
  expect(human.review.changedBy).toMatchObject({
    kind: 'person',
    name: 'Demo Owner',
  })
  await env.DB.prepare(
    `INSERT INTO agent_connections (id,church_id,user_id,client_id,client_name,scopes_json,created_at,expires_at)
    VALUES ('restore-agent','church_demo','user_demo_owner','client','Writing assistant','["draft:read","draft:write"]',?,?)`,
  )
    .bind(Date.now(), Date.now() + 60_000)
    .run()
  const agent = {
    userId: 'user_demo_owner',
    connectionId: 'restore-agent',
    clientId: 'client',
    requestId: 'agent-review',
  }
  let saved = await mutateChurch(
    env.DB,
    'church_demo',
    agent,
    'save',
    human.version,
    { ...human.draft, tagline: 'Agent draft' },
  )
  saved = await mutateChurch(
    env.DB,
    'church_demo',
    agent,
    'save',
    saved.version,
    { ...saved.draft, tagline: 'Second agent draft' },
  )
  expect(saved.review.changedBy).toMatchObject({
    kind: 'agent',
    name: 'Writing assistant',
  })
  expect(saved.review.canRestore).toBe(true)
  const liveBefore = await (await request(null, '/api/site')).text()
  await expect(
    mutateChurch(env.DB, 'church_demo', agent, 'restore', saved.version),
  ).rejects.toMatchObject({ status: 403 })
  const restoredResponse = await request(owner, `${base}/restore`, {
    version: saved.version,
  })
  expect(restoredResponse.status).toBe(200)
  const restored = await restoredResponse.json<ChurchSettings>()
  expect(restored.draft.tagline).toBe('Human draft')
  expect(restored.review.changedBy).toMatchObject({
    kind: 'person',
    name: 'Demo Owner',
  })
  expect(await (await request(null, '/api/site')).text()).toBe(liveBefore)
  expect(liveBefore).not.toContain('Writing assistant')
  expect(liveBefore).not.toContain('previous_draft')
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) total FROM audit_events WHERE action='church.draft_restored'",
    ).first(),
  ).toMatchObject({ total: 1 })
  const count = await evidence()
  const outbox = await outboxEvidence()
  expect(
    (await request(owner, `${base}/restore`, { version: saved.version }))
      .status,
  ).toBe(409)
  expect(
    (await request(owner, `${base}/publish`, { version: saved.version }))
      .status,
  ).toBe(409)
  expect(await evidence()).toBe(count)
  expect(await outboxEvidence()).toBe(outbox)
  expect((await settings()).draft).toEqual(restored.draft)
})

it('rejects restore without a snapshot or permission and never crosses church ownership', async () => {
  await env.DB.prepare(
    "UPDATE church_profiles SET previous_draft_json = NULL WHERE church_id = 'church_demo'",
  ).run()
  const current = await settings()
  const count = await evidence()
  expect(
    (await request(owner, `${base}/restore`, { version: current.version }))
      .status,
  ).toBe(409)
  for (const identity of [null, other])
    expect([401, 403]).toContain(
      (await request(identity, `${base}/restore`, { version: current.version }))
        .status,
    )
  expect(
    (
      await request(owner, '/api/church-settings/other/restore', {
        version: current.version,
      })
    ).status,
  ).toBe(403)
  expect(await evidence()).toBe(count)
})
