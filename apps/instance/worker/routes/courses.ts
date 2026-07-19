import { Hono } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../lib/auth'
import {
  broadcastContent,
  escapeLike,
  isSlugConflict,
  jsonBody,
  mutationEvidence,
  publishStatusSchema,
  slugSchema,
  validationError,
  versionInputSchema,
} from '../lib/content'
import { AppError } from '../lib/errors'
import {
  mapCourse,
  mapLesson,
  type CourseRow,
  type LessonRow,
} from '../lib/records'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

const courseFields = {
  ministryId: z.string().trim().min(1).max(128).nullable(),
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  status: publishStatusSchema,
  courseType: z.string().trim().min(1).max(80),
  deliveryMode: z.string().trim().min(1).max(80),
  audience: z.string().trim().max(160),
  duration: z.string().trim().max(120),
  featured: z.boolean(),
  certificateOffered: z.boolean(),
  summary: z.string().trim().max(4_000),
}
const courseCreateInput = z
  .object({
    ...courseFields,
    ministryId: courseFields.ministryId.default(null),
    status: publishStatusSchema.default('draft'),
    audience: courseFields.audience.default(''),
    duration: courseFields.duration.default(''),
    featured: courseFields.featured.default(false),
    certificateOffered: courseFields.certificateOffered.default(false),
    summary: courseFields.summary.default(''),
  })
  .strict()
const courseUpdateInput = z
  .object({
    version: z.number().int().positive(),
    ministryId: courseFields.ministryId.optional(),
    slug: courseFields.slug.optional(),
    title: courseFields.title.optional(),
    status: courseFields.status.optional(),
    courseType: courseFields.courseType.optional(),
    deliveryMode: courseFields.deliveryMode.optional(),
    audience: courseFields.audience.optional(),
    duration: courseFields.duration.optional(),
    featured: courseFields.featured.optional(),
    certificateOffered: courseFields.certificateOffered.optional(),
    summary: courseFields.summary.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one course field must be changed',
  })
const lessonFields = {
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(4_000),
  content: z.string().trim().min(1).max(100_000).nullable(),
  mediaId: z.string().trim().min(1).max(128).nullable(),
  estimatedMinutes: z.number().int().positive().max(10_000).nullable(),
  required: z.boolean(),
  sortOrder: z.number().int().nonnegative().max(10_000),
}
const lessonCreateInput = z
  .object({
    ...lessonFields,
    summary: lessonFields.summary.default(''),
    content: lessonFields.content.default(null),
    mediaId: lessonFields.mediaId.default(null),
    estimatedMinutes: lessonFields.estimatedMinutes.default(null),
    required: lessonFields.required.default(true),
  })
  .strict()
const lessonUpdateInput = z
  .object({
    version: z.number().int().positive(),
    title: lessonFields.title.optional(),
    summary: lessonFields.summary.optional(),
    content: lessonFields.content.optional(),
    mediaId: lessonFields.mediaId.optional(),
    estimatedMinutes: lessonFields.estimatedMinutes.optional(),
    required: lessonFields.required.optional(),
    sortOrder: lessonFields.sortOrder.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one lesson field must be changed',
  })
const listInput = z.object({
  query: z.string().trim().max(100).optional(),
  status: publishStatusSchema.optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const courseSelect = `
  SELECT c.id, c.church_id, c.ministry_id, c.slug, c.title, c.status,
         c.course_type, c.delivery_mode, c.audience, c.duration, c.featured,
         c.certificate_offered, c.summary, c.version, COUNT(l.id) AS lesson_count
  FROM courses c
  LEFT JOIN lessons l ON l.church_id = c.church_id AND l.course_id = c.id
`
const lessonSelect = `
  SELECT id, course_id, title, summary, content, media_id, estimated_minutes,
         required, sort_order, version
  FROM lessons
`

async function findCourse(db: D1Database, churchId: string, courseId: string) {
  const row = await db
    .prepare(
      `${courseSelect}
      WHERE c.church_id = ? AND c.id = ? AND c.deleted_at IS NULL
      GROUP BY c.id
    `,
    )
    .bind(churchId, courseId)
    .first<CourseRow>()
  if (!row) throw new AppError(404, 'course_not_found', 'Course not found')
  return row
}

async function findCourseByIdentifier(
  db: D1Database,
  churchId: string,
  identifier: string,
) {
  const row = await db
    .prepare(
      `${courseSelect}
      WHERE c.church_id = ? AND (c.id = ? OR c.slug = ? COLLATE NOCASE)
        AND c.deleted_at IS NULL
      GROUP BY c.id
    `,
    )
    .bind(churchId, identifier, identifier)
    .first<CourseRow>()
  if (!row) throw new AppError(404, 'course_not_found', 'Course not found')
  return row
}

async function findLesson(
  db: D1Database,
  churchId: string,
  courseId: string,
  lessonId: string,
) {
  const row = await db
    .prepare(`${lessonSelect} WHERE church_id = ? AND course_id = ? AND id = ?`)
    .bind(churchId, courseId, lessonId)
    .first<LessonRow>()
  if (!row) throw new AppError(404, 'lesson_not_found', 'Lesson not found')
  return row
}

async function lessonsFor(db: D1Database, churchId: string, courseId: string) {
  const result = await db
    .prepare(
      `${lessonSelect} WHERE church_id = ? AND course_id = ? ORDER BY sort_order, id`,
    )
    .bind(churchId, courseId)
    .all<LessonRow>()
  return result.results.map(mapLesson)
}

async function requireMinistry(
  db: D1Database,
  churchId: string,
  ministryId: string | null,
) {
  if (!ministryId) return
  const row = await db
    .prepare(
      'SELECT 1 AS present FROM ministries WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
    .bind(churchId, ministryId)
    .first<{ present: number }>()
  if (!row)
    throw new AppError(
      422,
      'invalid_ministry',
      'The selected ministry does not exist in this church',
    )
}

async function requireMedia(
  db: D1Database,
  churchId: string,
  mediaId: string | null,
  requirePublic: boolean,
) {
  if (!mediaId) return
  const row = await db
    .prepare(
      `
      SELECT visibility FROM media
      WHERE church_id = ? AND id = ? AND deleted_at IS NULL
    `,
    )
    .bind(churchId, mediaId)
    .first<{ visibility: 'public' | 'private' }>()
  if (!row)
    throw new AppError(
      422,
      'invalid_media',
      'The selected media does not exist in this church',
    )
  if (requirePublic && row.visibility !== 'public') {
    throw new AppError(
      422,
      'private_published_media',
      'Published course lessons require public media',
    )
  }
}

async function requirePublishableLessons(
  db: D1Database,
  churchId: string,
  courseId: string,
) {
  const invalid = await db
    .prepare(
      `
      SELECT 1 AS invalid
      FROM lessons l
      LEFT JOIN media m ON m.church_id = l.church_id AND m.id = l.media_id
      WHERE l.church_id = ? AND l.course_id = ? AND l.media_id IS NOT NULL
        AND (m.id IS NULL OR m.deleted_at IS NOT NULL OR m.visibility != 'public')
      LIMIT 1
    `,
    )
    .bind(churchId, courseId)
    .first<{ invalid: number }>()
  if (invalid) {
    throw new AppError(
      422,
      'private_published_media',
      'Published course lessons require public media',
    )
  }
}

export const courseRoutes = new Hono<AppEnv>()

courseRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'courses.write')
  const parsed = listInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)
  const conditions = ['c.church_id = ?', 'c.deleted_at IS NULL']
  const bindings: unknown[] = [churchId]
  if (parsed.data.query) {
    const pattern = `%${escapeLike(parsed.data.query)}%`
    conditions.push(`(
      c.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      c.summary LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      c.course_type LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      c.audience LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`)
    bindings.push(pattern, pattern, pattern, pattern)
  }
  if (parsed.data.status) {
    conditions.push('c.status = ?')
    bindings.push(parsed.data.status)
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB.prepare(
      'SELECT title, id FROM courses WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
      .bind(churchId, parsed.data.cursor)
      .first<{ title: string; id: string }>()
    if (!cursor)
      throw new AppError(422, 'invalid_cursor', 'The course cursor is invalid')
    conditions.push(
      '(c.title COLLATE NOCASE > ? COLLATE NOCASE OR (c.title = ? COLLATE NOCASE AND c.id > ?))',
    )
    bindings.push(cursor.title, cursor.title, cursor.id)
  }
  const result = await c.env.DB.prepare(
    `${courseSelect}
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.id
      ORDER BY c.title COLLATE NOCASE, c.id
      LIMIT ?
    `,
  )
    .bind(...bindings, parsed.data.limit + 1)
    .all<CourseRow>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore
    ? result.results.slice(0, parsed.data.limit)
    : result.results
  return c.json({
    courses: rows.map(mapCourse),
    page: {
      limit: parsed.data.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  })
})

courseRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'courses.write')
  const parsed = courseCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await requireMinistry(c.env.DB, churchId, parsed.data.ministryId)
  const courseId = `course_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
          INSERT INTO courses (
            id, church_id, ministry_id, slug, title, status, course_type,
            delivery_mode, audience, duration, featured, certificate_offered,
            summary, version, created_at, updated_at, last_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `,
      ).bind(
        courseId,
        churchId,
        parsed.data.ministryId,
        parsed.data.slug,
        parsed.data.title,
        parsed.data.status,
        parsed.data.courseType,
        parsed.data.deliveryMode,
        parsed.data.audience,
        parsed.data.duration,
        parsed.data.featured ? 1 : 0,
        parsed.data.certificateOffered ? 1 : 0,
        parsed.data.summary,
        now,
        now,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'course',
        entityId: courseId,
        eventName: 'courses.created',
        operationId,
        table: 'courses',
        now,
        metadata: { status: parsed.data.status },
      }),
    ])
  } catch (error) {
    if (isSlugConflict(error, 'courses')) {
      throw new AppError(
        409,
        'course_slug_exists',
        'A course already uses this slug',
      )
    }
    throw error
  }
  broadcastContent(c, churchId, 'course', courseId, 'created')
  return c.json(
    {
      course: mapCourse(await findCourse(c.env.DB, churchId, courseId)),
      lessons: [],
    },
    201,
  )
})

courseRoutes.get('/:churchId/:courseId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'courses.write')
  const course = await findCourseByIdentifier(
    c.env.DB,
    churchId,
    c.req.param('courseId'),
  )
  return c.json({
    course: mapCourse(course),
    lessons: await lessonsFor(c.env.DB, churchId, course.id),
  })
})

courseRoutes.patch('/:churchId/:courseId', async (c) => {
  const churchId = c.req.param('churchId')
  const courseId = c.req.param('courseId')
  const actor = await requirePermission(c, churchId, 'courses.write')
  const parsed = courseUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findCourse(c.env.DB, churchId, courseId)
  if (current.version !== parsed.data.version) {
    throw new AppError(
      409,
      'version_conflict',
      'The course changed after it was loaded',
    )
  }
  const next = {
    ministryId:
      parsed.data.ministryId === undefined
        ? current.ministry_id
        : parsed.data.ministryId,
    slug: parsed.data.slug ?? current.slug,
    title: parsed.data.title ?? current.title,
    status: parsed.data.status ?? current.status,
    courseType: parsed.data.courseType ?? current.course_type,
    deliveryMode: parsed.data.deliveryMode ?? current.delivery_mode,
    audience: parsed.data.audience ?? current.audience,
    duration: parsed.data.duration ?? current.duration,
    featured:
      parsed.data.featured === undefined
        ? current.featured === 1
        : parsed.data.featured,
    certificateOffered:
      parsed.data.certificateOffered === undefined
        ? current.certificate_offered === 1
        : parsed.data.certificateOffered,
    summary: parsed.data.summary ?? current.summary,
  }
  await requireMinistry(c.env.DB, churchId, next.ministryId)
  if (next.status === 'published')
    await requirePublishableLessons(c.env.DB, churchId, courseId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  let results: D1Result[]
  try {
    results = await c.env.DB.batch([
      c.env.DB.prepare(
        `
          UPDATE courses SET
            ministry_id = ?, slug = ?, title = ?, status = ?, course_type = ?,
            delivery_mode = ?, audience = ?, duration = ?, featured = ?,
            certificate_offered = ?, summary = ?, version = version + 1,
            updated_at = ?, last_operation_id = ?
          WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
        `,
      ).bind(
        next.ministryId,
        next.slug,
        next.title,
        next.status,
        next.courseType,
        next.deliveryMode,
        next.audience,
        next.duration,
        next.featured ? 1 : 0,
        next.certificateOffered ? 1 : 0,
        next.summary,
        now,
        operationId,
        churchId,
        courseId,
        current.version,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'course',
        entityId: courseId,
        eventName: 'courses.updated',
        operationId,
        table: 'courses',
        now,
        metadata: {
          changedFields: Object.keys(parsed.data).filter(
            (key) => key !== 'version',
          ),
          status: next.status,
        },
      }),
    ])
  } catch (error) {
    if (isSlugConflict(error, 'courses')) {
      throw new AppError(
        409,
        'course_slug_exists',
        'A course already uses this slug',
      )
    }
    throw error
  }
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The course changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'course', courseId, 'updated')
  const course = await findCourse(c.env.DB, churchId, courseId)
  return c.json({
    course: mapCourse(course),
    lessons: await lessonsFor(c.env.DB, churchId, courseId),
  })
})

courseRoutes.delete('/:churchId/:courseId', async (c) => {
  const churchId = c.req.param('churchId')
  const courseId = c.req.param('courseId')
  const actor = await requirePermission(c, churchId, 'courses.write')
  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findCourse(c.env.DB, churchId, courseId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE courses SET deleted_at = ?, updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `,
    ).bind(now, now, operationId, churchId, courseId, parsed.data.version),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'course',
      entityId: courseId,
      eventName: 'courses.deleted',
      operationId,
      table: 'courses',
      now,
      metadata: { previousVersion: parsed.data.version },
    }),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The course changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'course', courseId, 'deleted')
  return c.body(null, 204)
})

courseRoutes.post('/:churchId/:courseId/lessons', async (c) => {
  const churchId = c.req.param('churchId')
  const courseId = c.req.param('courseId')
  const actor = await requirePermission(c, churchId, 'courses.write')
  const parsed = lessonCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const course = await findCourse(c.env.DB, churchId, courseId)
  await requireMedia(
    c.env.DB,
    churchId,
    parsed.data.mediaId,
    course.status === 'published',
  )
  const lessonId = `lesson_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
          INSERT INTO lessons (
            id, church_id, course_id, title, summary, content, media_id,
            estimated_minutes, required, sort_order, version,
            created_at, updated_at, last_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `,
      ).bind(
        lessonId,
        churchId,
        courseId,
        parsed.data.title,
        parsed.data.summary,
        parsed.data.content,
        parsed.data.mediaId,
        parsed.data.estimatedMinutes,
        parsed.data.required ? 1 : 0,
        parsed.data.sortOrder,
        now,
        now,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'lesson',
        entityId: lessonId,
        eventName: 'lessons.created',
        operationId,
        table: 'lessons',
        now,
        metadata: { courseId, sortOrder: parsed.data.sortOrder },
      }),
    ])
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('lessons.course_id, lessons.sort_order')
    ) {
      throw new AppError(
        409,
        'lesson_order_exists',
        'Another lesson already uses this order',
      )
    }
    throw error
  }
  broadcastContent(c, churchId, 'lesson', lessonId, 'created')
  return c.json(
    {
      lesson: mapLesson(
        await findLesson(c.env.DB, churchId, courseId, lessonId),
      ),
    },
    201,
  )
})

courseRoutes.patch('/:churchId/:courseId/lessons/:lessonId', async (c) => {
  const churchId = c.req.param('churchId')
  const courseId = c.req.param('courseId')
  const lessonId = c.req.param('lessonId')
  const actor = await requirePermission(c, churchId, 'courses.write')
  const parsed = lessonUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const [course, current] = await Promise.all([
    findCourse(c.env.DB, churchId, courseId),
    findLesson(c.env.DB, churchId, courseId, lessonId),
  ])
  if (current.version !== parsed.data.version) {
    throw new AppError(
      409,
      'version_conflict',
      'The lesson changed after it was loaded',
    )
  }
  const next = {
    title: parsed.data.title ?? current.title,
    summary: parsed.data.summary ?? current.summary,
    content:
      parsed.data.content === undefined
        ? (current.content ?? null)
        : parsed.data.content,
    mediaId:
      parsed.data.mediaId === undefined
        ? (current.media_id ?? null)
        : parsed.data.mediaId,
    estimatedMinutes:
      parsed.data.estimatedMinutes === undefined
        ? current.estimated_minutes
        : parsed.data.estimatedMinutes,
    required:
      parsed.data.required === undefined
        ? current.required === 1
        : parsed.data.required,
    sortOrder: parsed.data.sortOrder ?? current.sort_order,
  }
  await requireMedia(
    c.env.DB,
    churchId,
    next.mediaId,
    course.status === 'published',
  )
  const operationId = crypto.randomUUID()
  const now = Date.now()
  let results: D1Result[]
  try {
    results = await c.env.DB.batch([
      c.env.DB.prepare(
        `
          UPDATE lessons SET
            title = ?, summary = ?, content = ?, media_id = ?, estimated_minutes = ?,
            required = ?, sort_order = ?, version = version + 1,
            updated_at = ?, last_operation_id = ?
          WHERE church_id = ? AND course_id = ? AND id = ? AND version = ?
        `,
      ).bind(
        next.title,
        next.summary,
        next.content,
        next.mediaId,
        next.estimatedMinutes,
        next.required ? 1 : 0,
        next.sortOrder,
        now,
        operationId,
        churchId,
        courseId,
        lessonId,
        current.version,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'lesson',
        entityId: lessonId,
        eventName: 'lessons.updated',
        operationId,
        table: 'lessons',
        now,
        metadata: {
          courseId,
          changedFields: Object.keys(parsed.data).filter(
            (key) => key !== 'version',
          ),
        },
      }),
    ])
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('lessons.course_id, lessons.sort_order')
    ) {
      throw new AppError(
        409,
        'lesson_order_exists',
        'Another lesson already uses this order',
      )
    }
    throw error
  }
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The lesson changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'lesson', lessonId, 'updated')
  return c.json({
    lesson: mapLesson(await findLesson(c.env.DB, churchId, courseId, lessonId)),
  })
})

courseRoutes.delete('/:churchId/:courseId/lessons/:lessonId', async (c) => {
  const churchId = c.req.param('churchId')
  const courseId = c.req.param('courseId')
  const lessonId = c.req.param('lessonId')
  const actor = await requirePermission(c, churchId, 'courses.write')
  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findLesson(c.env.DB, churchId, courseId, lessonId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE lessons SET last_operation_id = ?
        WHERE church_id = ? AND course_id = ? AND id = ? AND version = ?
      `,
    ).bind(operationId, churchId, courseId, lessonId, parsed.data.version),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'lesson',
      entityId: lessonId,
      eventName: 'lessons.deleted',
      operationId,
      table: 'lessons',
      now,
      metadata: { courseId, previousVersion: parsed.data.version },
    }),
    c.env.DB.prepare(
      `
        DELETE FROM lessons
        WHERE church_id = ? AND course_id = ? AND id = ? AND last_operation_id = ?
      `,
    ).bind(churchId, courseId, lessonId, operationId),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The lesson changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'lesson', lessonId, 'deleted')
  return c.body(null, 204)
})
