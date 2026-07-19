import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  Course,
  CourseDetailResponse,
  EventRecord,
  Group,
  Lesson,
  MediaRecord,
  Sermon,
} from '../src/lib/api-types'
import type { AccessIdentity } from '../worker/lib/auth'
import { AppError } from '../worker/lib/errors'
import { churchRoutes } from '../worker/routes/churches'
import { courseRoutes } from '../worker/routes/courses'
import { eventRoutes } from '../worker/routes/events'
import { groupRoutes } from '../worker/routes/groups'
import { mediaManagementRoutes, mediaRoutes } from '../worker/routes/media'
import { sermonRoutes } from '../worker/routes/sermons'

const identity: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'demo-owner-access-subject',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}

function contentApp(requestIdentity: AccessIdentity | null) {
  const app = new Hono<{
    Bindings: Env
    Variables: { identity: AccessIdentity | null; requestId: string }
  }>()
  app.use('*', async (c, next) => {
    c.set('identity', requestIdentity)
    c.set('requestId', 'request_content_test')
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
  app.route('/api/churches', churchRoutes)
  app.route('/api/groups', groupRoutes)
  app.route('/api/courses', courseRoutes)
  app.route('/api/events', eventRoutes)
  app.route('/api/sermons', sermonRoutes)
  app.route('/api/media', mediaManagementRoutes)
  app.route('/media', mediaRoutes)
  return app
}

const app = contentApp(identity)
const publicApp = contentApp(null)
const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} as unknown as ExecutionContext

async function jsonRequest(
  method: string,
  pathname: string,
  body?: unknown,
  asPublic = false,
) {
  return (asPublic ? publicApp : app).fetch(
    new Request(`https://fellowship42.test${pathname}`, {
      method,
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    executionContext,
  )
}

async function uploadMedia(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
  visibility: 'public' | 'private',
  altText: string,
) {
  const response = await app.fetch(
    new Request(
      `https://fellowship42.test/api/media/church_demo?${new URLSearchParams({ visibility, altText })}`,
      {
        method: 'POST',
        headers: {
          'content-type': contentType,
        },
        body: bytes.buffer,
      },
    ),
    env,
    executionContext,
  )
  expect(response.status).toBe(201)
  return (await response.json<{ media: MediaRecord }>()).media
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
    .bind(identity.provider, identity.subject, identity.email, now, now)
    .run()
})

describe('ministry and publishing workflows', () => {
  it('grants the ministry role bounded publishing access and denies cross-church scope', async () => {
    const publisher: AccessIdentity = {
      provider: 'cloudflare-access',
      subject: 'publisher-subject',
      email: 'publisher@example.test',
      firstName: 'Ministry',
      lastName: 'Publisher',
    }
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare(
        `
          INSERT OR IGNORE INTO users (
            id, email, first_name, last_name, status, created_at, updated_at
          ) VALUES ('user_publisher', ?, 'Ministry', 'Publisher', 'active', ?, ?)
        `,
      ).bind(publisher.email, now, now),
      env.DB.prepare(
        `
          INSERT OR IGNORE INTO auth_identities (
            id, user_id, provider, subject, email_at_provider, created_at, updated_at
          ) VALUES ('identity_publisher', 'user_publisher', ?, ?, ?, ?, ?)
        `,
      ).bind(publisher.provider, publisher.subject, publisher.email, now, now),
      env.DB.prepare(
        `
          INSERT OR IGNORE INTO church_memberships (
            id, church_id, user_id, status, joined_at, created_at, updated_at
          ) VALUES ('membership_publisher', 'church_demo', 'user_publisher', 'active', ?, ?, ?)
        `,
      ).bind(now, now, now),
      env.DB.prepare(
        `
          INSERT OR IGNORE INTO membership_roles (
            church_id, membership_id, role_id, assigned_at, assigned_by_user_id
          ) VALUES ('church_demo', 'membership_publisher', 'role_demo_leader', ?, 'user_demo_owner')
        `,
      ).bind(now),
    ])
    const publisherApp = contentApp(publisher)
    for (const path of ['groups', 'courses', 'events', 'sermons', 'media']) {
      const response = await publisherApp.fetch(
        new Request(`https://fellowship42.test/api/${path}/church_demo`),
        env,
        executionContext,
      )
      expect(response.status, path).toBe(200)
    }
    const crossChurch = await publisherApp.fetch(
      new Request('https://fellowship42.test/api/groups/church_not_assigned'),
      env,
      executionContext,
    )
    expect(crossChurch.status).toBe(403)
  })

  it('creates, publishes, searches, audits, and soft-deletes groups', async () => {
    const unknownField = await jsonRequest('POST', '/api/groups/church_demo', {
      slug: 'not-accepted',
      title: 'Not accepted',
      groupType: 'test',
      memberCount: 50,
    })
    expect(unknownField.status).toBe(422)

    const createResponse = await jsonRequest(
      'POST',
      '/api/groups/church_demo',
      {
        slug: `care-team-${crypto.randomUUID()}`,
        title: 'Care Team',
        groupType: 'service-team',
        audience: 'Adults',
        schedule: 'First Saturday',
        enrollmentPolicy: 'request',
        summary: 'A draft ministry team.',
      },
    )
    const created = await createResponse.json<{ group: Group }>()
    expect(createResponse.status).toBe(201)
    expect(created.group).toMatchObject({ status: 'draft', version: 1 })

    const publicDraft = await jsonRequest(
      'GET',
      `/api/churches/church_demo/groups`,
      undefined,
      true,
    )
    const draftList = await publicDraft.json<{ groups: Group[] }>()
    expect(draftList.groups.map((group) => group.id)).not.toContain(
      created.group.id,
    )

    const publishResponse = await jsonRequest(
      'PATCH',
      `/api/groups/church_demo/${created.group.id}`,
      { version: 1, status: 'published', featured: true },
    )
    const published = await publishResponse.json<{ group: Group }>()
    expect(published.group).toMatchObject({
      status: 'published',
      featured: true,
      version: 2,
    })

    const searchResponse = await jsonRequest(
      'GET',
      '/api/groups/church_demo?query=Care&status=published',
    )
    const search = await searchResponse.json<{ groups: Group[] }>()
    expect(search.groups.map((group) => group.id)).toContain(created.group.id)

    const stale = await jsonRequest(
      'PATCH',
      `/api/groups/church_demo/${created.group.id}`,
      {
        version: 1,
        title: 'Stale title',
      },
    )
    expect(stale.status).toBe(409)

    const remove = await jsonRequest(
      'DELETE',
      `/api/groups/church_demo/${created.group.id}`,
      {
        version: 2,
      },
    )
    expect(remove.status).toBe(204)
    expect(
      (await jsonRequest('GET', `/api/groups/church_demo/${created.group.id}`))
        .status,
    ).toBe(404)

    const events = await env.DB.prepare(
      `
        SELECT action FROM audit_events
        WHERE entity_type = 'group' AND entity_id = ?
        ORDER BY occurred_at, rowid
      `,
    )
      .bind(created.group.id)
      .all<{ action: string }>()
    expect(events.results.map(({ action }) => action)).toEqual([
      'groups.created',
      'groups.updated',
      'groups.deleted',
    ])
  })

  it('publishes course lessons only with church-owned public media', async () => {
    const courseResponse = await jsonRequest(
      'POST',
      '/api/courses/church_demo',
      {
        slug: `foundations-${crypto.randomUUID()}`,
        title: 'Foundations',
        status: 'published',
        courseType: 'discipleship',
        deliveryMode: 'self-paced',
        summary: 'Core practices.',
      },
    )
    const course = (await courseResponse.json<{ course: Course }>()).course
    expect(courseResponse.status).toBe(201)

    const privateMedia = await uploadMedia(
      new TextEncoder().encode('lesson handout'),
      'application/pdf',
      'private',
      'Foundations handout',
    )
    const rejectedLesson = await jsonRequest(
      'POST',
      `/api/courses/church_demo/${course.id}/lessons`,
      {
        title: 'Practice',
        content: 'A complete lesson body.',
        mediaId: privateMedia.id,
        sortOrder: 0,
      },
    )
    expect(rejectedLesson.status).toBe(422)

    const publicMediaResponse = await jsonRequest(
      'PATCH',
      `/api/media/church_demo/${privateMedia.id}`,
      { version: privateMedia.version, visibility: 'public' },
    )
    const publicMedia = (
      await publicMediaResponse.json<{ media: MediaRecord }>()
    ).media
    expect(publicMedia).toMatchObject({ visibility: 'public', version: 2 })

    const lessonResponse = await jsonRequest(
      'POST',
      `/api/courses/church_demo/${course.id}/lessons`,
      {
        title: 'Practice',
        summary: 'Put the lesson into action.',
        content: 'A complete lesson body.',
        mediaId: publicMedia.id,
        estimatedMinutes: 15,
        sortOrder: 0,
      },
    )
    const lesson = (await lessonResponse.json<{ lesson: Lesson }>()).lesson
    expect(lessonResponse.status).toBe(201)
    expect(lesson).toMatchObject({
      content: 'A complete lesson body.',
      version: 1,
    })

    const publicDetailResponse = await jsonRequest(
      'GET',
      `/api/churches/church_demo/courses/${course.slug}`,
      undefined,
      true,
    )
    const publicDetail = await publicDetailResponse.json<CourseDetailResponse>()
    expect(publicDetail.course.lessonCount).toBe(1)
    expect(publicDetail.lessons[0]).toMatchObject({
      id: lesson.id,
      mediaId: publicMedia.id,
    })

    const mediaResponse = await publicApp.fetch(
      new Request(`https://fellowship42.test${publicMedia.url}`, {
        headers: { Range: 'bytes=0-5' },
      }),
      env,
      executionContext,
    )
    expect(mediaResponse.status).toBe(206)
    expect(mediaResponse.headers.get('content-range')).toBe('bytes 0-5/14')
    expect(new TextDecoder().decode(await mediaResponse.arrayBuffer())).toBe(
      'lesson',
    )

    const referencedDelete = await jsonRequest(
      'DELETE',
      `/api/media/church_demo/${publicMedia.id}`,
      { version: publicMedia.version },
    )
    expect(referencedDelete.status).toBe(409)
  })

  it('publishes scheduled events and sermons with bounded media references', async () => {
    const startsAt = Date.now() + 86_400_000
    const eventResponse = await jsonRequest('POST', '/api/events/church_demo', {
      slug: `community-night-${crypto.randomUUID()}`,
      title: 'Community Night',
      status: 'published',
      startsAt,
      endsAt: startsAt + 7_200_000,
      timezone: 'America/New_York',
      location: 'Fellowship Hall',
      registrationUrl: 'https://example.test/register',
    })
    const event = (await eventResponse.json<{ event: EventRecord }>()).event
    expect(eventResponse.status).toBe(201)
    expect(event).toMatchObject({ timezone: 'America/New_York', version: 1 })

    const publicEvents = await jsonRequest(
      'GET',
      '/api/churches/church_demo/events',
      undefined,
      true,
    )
    expect(
      (await publicEvents.json<{ events: EventRecord[] }>()).events.map(
        ({ id }) => id,
      ),
    ).toContain(event.id)

    const audio = await uploadMedia(
      new TextEncoder().encode('audio-bytes'),
      'audio/mpeg',
      'public',
      'Sermon audio',
    )
    const sermonResponse = await jsonRequest(
      'POST',
      '/api/sermons/church_demo',
      {
        slug: `steadfast-hope-${crypto.randomUUID()}`,
        title: 'Steadfast Hope',
        status: 'published',
        speaker: 'Jordan Lee',
        series: 'Hope',
        summary: 'A message for the church.',
        audioMediaId: audio.id,
        preachedAt: Date.now(),
      },
    )
    const sermon = (await sermonResponse.json<{ sermon: Sermon }>()).sermon
    expect(sermonResponse.status).toBe(201)
    expect(sermon).toMatchObject({ audioMediaId: audio.id, version: 1 })

    const publicSermons = await jsonRequest(
      'GET',
      '/api/churches/church_demo/sermons',
      undefined,
      true,
    )
    expect(
      (await publicSermons.json<{ sermons: Sermon[] }>()).sermons.map(
        ({ id }) => id,
      ),
    ).toContain(sermon.id)

    const topics = await env.DB.prepare(
      `
        SELECT topic FROM outbox_events
        WHERE aggregate_id IN (?, ?)
        ORDER BY created_at, rowid
      `,
    )
      .bind(event.id, sermon.id)
      .all<{ topic: string }>()
    expect(topics.results.map(({ topic }) => topic)).toEqual([
      'events.created',
      'sermons.created',
    ])
  })
})
