import { Hono } from 'hono'
import { z } from 'zod'
import type { CursorPage } from '../../contracts/api'
import { escapeLike, validationError } from '../lib/content'
import { AppError } from '../lib/errors'
import {
  requireChurchMembership,
  requirePermission,
  syncCurrentUser,
} from '../lib/auth'
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

async function findVisibleChurch(
  c: Parameters<typeof requirePermission>[0],
  identifier: string,
) {
  const church = await c.env.DB.prepare(
    `${churchSelect} WHERE (c.id = ? OR c.slug = ?) AND c.deleted_at IS NULL`,
  )
    .bind(identifier, identifier)
    .first<ChurchRow>()
  if (!church) throw new AppError(404, 'church_not_found', 'Church not found')
  if (church.status !== 'published') await requireChurchMembership(c, church.id)
  return church
}

async function serviceTimes(db: D1Database, churchId: string) {
  const result = await db
    .prepare(
      `
      SELECT id, label, day_of_week, local_time
      FROM service_times
      WHERE church_id = ?
      ORDER BY sort_order, day_of_week, local_time
    `,
    )
    .bind(churchId)
    .all<ServiceTimeRow>()
  return result.results
}

const publishedListInput = z.object({
  query: z.string().trim().max(100).optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
})

// Keyset order for each published list; the cursor is the last row's id.
const publishedOrders = {
  title: {
    orderBy: 'title COLLATE NOCASE, id',
    after:
      '(title COLLATE NOCASE > ? COLLATE NOCASE OR (title = ? COLLATE NOCASE AND id > ?))',
    key: 'title',
  },
  starts_at: {
    orderBy: 'starts_at, id',
    after: '(starts_at > ? OR (starts_at = ? AND id > ?))',
    key: 'starts_at',
  },
  preached_at: {
    orderBy: 'preached_at DESC, id',
    after: '(preached_at < ? OR (preached_at = ? AND id > ?))',
    key: 'preached_at',
  },
} as const

/**
 * One page of a church's published records, searched on the server. Readers
 * without the write permission use these lists, so they page like the staff
 * lists rather than stopping at a fixed number of rows.
 */
async function publishedPage<Row extends { id: string }>(
  c: Parameters<typeof requirePermission>[0],
  churchId: string,
  spec: {
    table: 'groups' | 'courses' | 'events' | 'sermons'
    columns: string
    search: string[]
    order: keyof typeof publishedOrders
    upcomingOnly?: boolean
  },
): Promise<{ rows: Row[]; page: CursorPage }> {
  const parsed = publishedListInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)
  const order = publishedOrders[spec.order]
  const conditions = [
    'church_id = ?',
    "status = 'published'",
    'deleted_at IS NULL',
  ]
  const bindings: unknown[] = [churchId]
  if (spec.upcomingOnly) {
    conditions.push('starts_at >= ?')
    bindings.push(Date.now())
  }
  const visible = conditions.join(' AND ')
  const visibleBindings = [...bindings]
  if (parsed.data.query) {
    const pattern = `%${escapeLike(parsed.data.query)}%`
    conditions.push(
      `(${spec.search.map((column) => `${column} LIKE ? ESCAPE '\\' COLLATE NOCASE`).join(' OR ')})`,
    )
    bindings.push(...spec.search.map(() => pattern))
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB.prepare(
      `SELECT ${order.key} AS key, id FROM ${spec.table} WHERE ${visible} AND id = ?`,
    )
      .bind(...visibleBindings, parsed.data.cursor)
      .first<{ key: string | number; id: string }>()
    if (!cursor)
      throw new AppError(422, 'invalid_cursor', 'The list cursor is invalid')
    conditions.push(order.after)
    bindings.push(cursor.key, cursor.key, cursor.id)
  }
  const result = await c.env.DB.prepare(
    `SELECT ${spec.columns} FROM ${spec.table}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${order.orderBy}
      LIMIT ?`,
  )
    .bind(...bindings, parsed.data.limit + 1)
    .all<Row>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore
    ? result.results.slice(0, parsed.data.limit)
    : result.results
  return {
    rows,
    page: {
      limit: parsed.data.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  }
}

churchRoutes.get('/', async (c) => {
  const identity = c.get('identity')
  const userId = identity ? (await syncCurrentUser(c.env.DB, identity)).id : ''
  const result = await c.env.DB.prepare(
    `${churchSelect}
      WHERE c.deleted_at IS NULL AND (
        c.status = 'published' OR EXISTS (
          SELECT 1 FROM church_memberships cm
          WHERE cm.church_id = c.id AND cm.user_id = ? AND cm.status = 'active'
        )
      )
      ORDER BY c.name
      LIMIT 200`,
  )
    .bind(userId)
    .all<ChurchRow>()

  const allServiceTimes = await c.env.DB.prepare(
    `
      SELECT st.id, st.church_id, st.label, st.day_of_week, st.local_time
      FROM service_times st
      JOIN churches c ON c.id = st.church_id
      WHERE c.deleted_at IS NULL AND (
        c.status = 'published' OR EXISTS (
          SELECT 1 FROM church_memberships cm
          WHERE cm.church_id = c.id AND cm.user_id = ? AND cm.status = 'active'
        )
      )
      ORDER BY st.church_id, st.sort_order, st.day_of_week, st.local_time
    `,
  )
    .bind(userId)
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
  const church = await findVisibleChurch(c, c.req.param('identifier'))
  return c.json({
    church: mapChurch(church, await serviceTimes(c.env.DB, church.id)),
  })
})

churchRoutes.get('/:identifier/ministries', async (c) => {
  const church = await findVisibleChurch(c, c.req.param('identifier'))
  const result = await c.env.DB.prepare(
    `
      SELECT id, church_id, slug, title, status, audience, schedule, featured, summary
      FROM ministries
      WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL
      ORDER BY featured DESC, title
      LIMIT 200
    `,
  )
    .bind(church.id)
    .all<MinistryRow>()
  return c.json({ ministries: result.results.map(mapMinistry) })
})

churchRoutes.get('/:identifier/groups', async (c) => {
  const church = await findVisibleChurch(c, c.req.param('identifier'))
  const { rows, page } = await publishedPage<GroupRow>(c, church.id, {
    table: 'groups',
    columns: `id, church_id, ministry_id, slug, title, status, group_type, audience,
      schedule, location, enrollment_policy, capacity, featured, summary, version`,
    search: ['title', 'summary', 'group_type', 'audience', 'location'],
    order: 'title',
  })
  return c.json({ groups: rows.map(mapGroup), page })
})

churchRoutes.get('/:identifier/courses', async (c) => {
  const church = await findVisibleChurch(c, c.req.param('identifier'))
  const { rows, page } = await publishedPage<CourseRow>(c, church.id, {
    table: 'courses',
    columns: `id, church_id, ministry_id, slug, title, status, course_type,
      delivery_mode, audience, duration, featured, certificate_offered, summary,
      version, (SELECT COUNT(*) FROM lessons l
        WHERE l.church_id = courses.church_id AND l.course_id = courses.id) AS lesson_count`,
    search: ['title', 'summary', 'course_type', 'audience'],
    order: 'title',
  })
  return c.json({ courses: rows.map(mapCourse), page })
})

churchRoutes.get('/:identifier/courses/:slug', async (c) => {
  const church = await findVisibleChurch(c, c.req.param('identifier'))
  // One snapshot: the church's visibility, the course's published status and
  // its lessons are read together, so a lesson added after the course or
  // church was unpublished is never served.
  const [visibility, course, lessons] = await c.env.DB.batch([
    c.env.DB.prepare(
      'SELECT status FROM churches WHERE id = ? AND deleted_at IS NULL',
    ).bind(church.id),
    c.env.DB.prepare(
      `
      SELECT c.id, c.church_id, c.ministry_id, c.slug, c.title, c.status,
             c.course_type, c.delivery_mode, c.audience, c.duration, c.featured,
             c.certificate_offered, c.summary, c.version, COUNT(l.id) AS lesson_count
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id
      WHERE c.church_id = ? AND c.slug = ? COLLATE NOCASE
        AND c.status = 'published' AND c.deleted_at IS NULL
      GROUP BY c.id
    `,
    ).bind(church.id, c.req.param('slug')),
    c.env.DB.prepare(
      `
      SELECT l.id, l.course_id, l.title, l.summary, l.content, l.media_id,
             l.estimated_minutes, l.required, l.sort_order, l.version
      FROM lessons l
      JOIN courses c ON c.church_id = l.church_id AND c.id = l.course_id
      WHERE l.church_id = ? AND c.slug = ? COLLATE NOCASE
        AND c.status = 'published' AND c.deleted_at IS NULL
      ORDER BY l.sort_order
    `,
    ).bind(church.id, c.req.param('slug')),
  ])
  const status = (visibility.results[0] as { status: string } | undefined)
    ?.status
  if (!status) throw new AppError(404, 'church_not_found', 'Church not found')
  if (status !== 'published') await requireChurchMembership(c, church.id)
  const row = course.results[0] as CourseRow | undefined
  if (!row) throw new AppError(404, 'course_not_found', 'Course not found')
  return c.json({
    course: mapCourse(row),
    lessons: (lessons.results as LessonRow[]).map(mapLesson),
  })
})

churchRoutes.get('/:identifier/events', async (c) => {
  const church = await findVisibleChurch(c, c.req.param('identifier'))
  const { rows, page } = await publishedPage<EventRow>(c, church.id, {
    table: 'events',
    columns: `id, church_id, slug, title, status, summary, starts_at, ends_at,
      timezone, location, registration_url, capacity, featured, version`,
    search: ['title', 'summary', 'location'],
    order: 'starts_at',
    upcomingOnly: true,
  })
  return c.json({ events: rows.map(mapEvent), page })
})

churchRoutes.get('/:identifier/sermons', async (c) => {
  const church = await findVisibleChurch(c, c.req.param('identifier'))
  const { rows, page } = await publishedPage<SermonRow>(c, church.id, {
    table: 'sermons',
    columns: `id, church_id, slug, title, status, speaker, series, summary,
      video_url, audio_media_id, preached_at, featured, version`,
    search: ['title', 'speaker', 'series', 'summary'],
    order: 'preached_at',
  })
  return c.json({ sermons: rows.map(mapSermon), page })
})

churchRoutes.get('/:identifier/live', async (c) => {
  const church = await findVisibleChurch(c, c.req.param('identifier'))
  await requirePermission(c, church.id, 'people.read')
  return c.env.CHURCH_ROOMS.getByName(church.id).fetch(c.req.raw)
})
