import { Hono } from 'hono'
import { AppError } from '../lib/errors'
import { requirePermission } from '../lib/auth'
import {
  churchSelect,
  mapChurch,
  mapCourse,
  mapEvent,
  mapGroup,
  mapLesson,
  mapMinistry,
  mapSermon,
  type ChurchRow,
  type CourseRow,
  type EventRow,
  type GroupRow,
  type LessonRow,
  type MinistryRow,
  type SermonRow,
  type ServiceTimeRow,
} from '../lib/records'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

export const churchRoutes = new Hono<AppEnv>()

async function findPublishedChurch(db: D1Database, identifier: string) {
  const church = await db
    .prepare(`${churchSelect} WHERE (c.id = ? OR c.slug = ?) AND c.status = 'published' AND c.deleted_at IS NULL`)
    .bind(identifier, identifier)
    .first<ChurchRow>()
  if (!church) throw new AppError(404, 'church_not_found', 'Church not found')
  return church
}

async function serviceTimes(db: D1Database, churchId: string) {
  const result = await db
    .prepare(`
      SELECT id, label, day_of_week, local_time
      FROM service_times
      WHERE church_id = ?
      ORDER BY sort_order, day_of_week, local_time
    `)
    .bind(churchId)
    .all<ServiceTimeRow>()
  return result.results
}

churchRoutes.get('/', async (c) => {
  const result = await c.env.DB
    .prepare(`${churchSelect} WHERE c.status = 'published' AND c.deleted_at IS NULL ORDER BY c.name LIMIT 200`)
    .all<ChurchRow>()

  const allServiceTimes = await c.env.DB
    .prepare(`
      SELECT st.id, st.church_id, st.label, st.day_of_week, st.local_time
      FROM service_times st
      JOIN churches c ON c.id = st.church_id
      WHERE c.status = 'published' AND c.deleted_at IS NULL
      ORDER BY st.church_id, st.sort_order, st.day_of_week, st.local_time
    `)
    .all<ServiceTimeRow & { church_id: string }>()
  const timesByChurch = new Map<string, ServiceTimeRow[]>()
  for (const service of allServiceTimes.results) {
    const times = timesByChurch.get(service.church_id) ?? []
    times.push(service)
    timesByChurch.set(service.church_id, times)
  }
  const churches = result.results.map((church) =>
    mapChurch(church, timesByChurch.get(church.id) ?? []),
  )
  return c.json({ churches })
})

churchRoutes.get('/:identifier', async (c) => {
  const church = await findPublishedChurch(c.env.DB, c.req.param('identifier'))
  return c.json({ church: mapChurch(church, await serviceTimes(c.env.DB, church.id)) })
})

churchRoutes.get('/:identifier/ministries', async (c) => {
  const church = await findPublishedChurch(c.env.DB, c.req.param('identifier'))
  const result = await c.env.DB
    .prepare(`
      SELECT id, church_id, slug, title, status, audience, schedule, featured, summary
      FROM ministries
      WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL
      ORDER BY featured DESC, title
      LIMIT 200
    `)
    .bind(church.id)
    .all<MinistryRow>()
  return c.json({ ministries: result.results.map(mapMinistry) })
})

churchRoutes.get('/:identifier/groups', async (c) => {
  const church = await findPublishedChurch(c.env.DB, c.req.param('identifier'))
  const result = await c.env.DB
    .prepare(`
      SELECT id, church_id, ministry_id, slug, title, status, group_type, audience,
             schedule, location, enrollment_policy, capacity, featured, summary
      FROM groups
      WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL
      ORDER BY featured DESC, title
      LIMIT 200
    `)
    .bind(church.id)
    .all<GroupRow>()
  return c.json({ groups: result.results.map(mapGroup) })
})

churchRoutes.get('/:identifier/courses', async (c) => {
  const church = await findPublishedChurch(c.env.DB, c.req.param('identifier'))
  const result = await c.env.DB
    .prepare(`
      SELECT c.id, c.church_id, c.ministry_id, c.slug, c.title, c.status,
             c.course_type, c.delivery_mode, c.audience, c.duration, c.featured,
             c.certificate_offered, c.summary, COUNT(l.id) AS lesson_count
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id
      WHERE c.church_id = ? AND c.status = 'published' AND c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY c.featured DESC, c.title
      LIMIT 200
    `)
    .bind(church.id)
    .all<CourseRow>()
  return c.json({ courses: result.results.map(mapCourse) })
})

churchRoutes.get('/:identifier/courses/:slug', async (c) => {
  const church = await findPublishedChurch(c.env.DB, c.req.param('identifier'))
  const row = await c.env.DB
    .prepare(`
      SELECT c.id, c.church_id, c.ministry_id, c.slug, c.title, c.status,
             c.course_type, c.delivery_mode, c.audience, c.duration, c.featured,
             c.certificate_offered, c.summary, COUNT(l.id) AS lesson_count
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id
      WHERE c.church_id = ? AND c.slug = ? COLLATE NOCASE
        AND c.status = 'published' AND c.deleted_at IS NULL
      GROUP BY c.id
    `)
    .bind(church.id, c.req.param('slug'))
    .first<CourseRow>()
  if (!row) throw new AppError(404, 'course_not_found', 'Course not found')

  const lessonResult = await c.env.DB
    .prepare(`
      SELECT id, course_id, title, summary, estimated_minutes, required, sort_order
      FROM lessons
      WHERE church_id = ? AND course_id = ?
      ORDER BY sort_order
    `)
    .bind(church.id, row.id)
    .all<LessonRow>()
  return c.json({ course: mapCourse(row), lessons: lessonResult.results.map(mapLesson) })
})

churchRoutes.get('/:identifier/events', async (c) => {
  const church = await findPublishedChurch(c.env.DB, c.req.param('identifier'))
  const result = await c.env.DB
    .prepare(`
      SELECT id, church_id, slug, title, status, summary, starts_at, ends_at,
             location, registration_url, featured
      FROM events
      WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL AND starts_at >= ?
      ORDER BY starts_at
      LIMIT 200
    `)
    .bind(church.id, Date.now())
    .all<EventRow>()
  return c.json({ events: result.results.map(mapEvent) })
})

churchRoutes.get('/:identifier/sermons', async (c) => {
  const church = await findPublishedChurch(c.env.DB, c.req.param('identifier'))
  const result = await c.env.DB
    .prepare(`
      SELECT id, church_id, slug, title, status, speaker, series, summary,
             video_url, preached_at, featured
      FROM sermons
      WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL
      ORDER BY preached_at DESC
      LIMIT 200
    `)
    .bind(church.id)
    .all<SermonRow>()
  return c.json({ sermons: result.results.map(mapSermon) })
})

churchRoutes.get('/:identifier/live', async (c) => {
  const church = await findPublishedChurch(c.env.DB, c.req.param('identifier'))
  await requirePermission(c, church.id, 'people.read')
  return c.env.CHURCH_ROOMS.getByName(church.id).fetch(c.req.raw)
})
