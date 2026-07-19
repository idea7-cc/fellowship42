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
import { mapSermon, type SermonRow } from '../lib/records'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

const sermonFields = {
  slug: slugSchema,
  title: z.string().trim().min(1).max(200),
  status: publishStatusSchema,
  speaker: z.string().trim().min(1).max(160),
  series: z.string().trim().min(1).max(160).nullable(),
  summary: z.string().trim().max(10_000),
  videoUrl: z.url().nullable(),
  audioMediaId: z.string().trim().min(1).max(128).nullable(),
  preachedAt: z.number().int().nonnegative(),
  featured: z.boolean(),
}
const sermonCreateInput = z
  .object({
    ...sermonFields,
    status: publishStatusSchema.default('draft'),
    series: sermonFields.series.default(null),
    summary: sermonFields.summary.default(''),
    videoUrl: sermonFields.videoUrl.default(null),
    audioMediaId: sermonFields.audioMediaId.default(null),
    featured: sermonFields.featured.default(false),
  })
  .strict()
const sermonUpdateInput = z
  .object({
    version: z.number().int().positive(),
    slug: sermonFields.slug.optional(),
    title: sermonFields.title.optional(),
    status: sermonFields.status.optional(),
    speaker: sermonFields.speaker.optional(),
    series: sermonFields.series.optional(),
    summary: sermonFields.summary.optional(),
    videoUrl: sermonFields.videoUrl.optional(),
    audioMediaId: sermonFields.audioMediaId.optional(),
    preachedAt: sermonFields.preachedAt.optional(),
    featured: sermonFields.featured.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one sermon field must be changed',
  })
const listInput = z.object({
  query: z.string().trim().max(100).optional(),
  status: publishStatusSchema.optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const sermonSelect = `
  SELECT id, church_id, slug, title, status, speaker, series, summary,
         video_url, audio_media_id, preached_at, featured, version
  FROM sermons
`

async function findSermon(db: D1Database, churchId: string, sermonId: string) {
  const row = await db
    .prepare(
      `${sermonSelect} WHERE church_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(churchId, sermonId)
    .first<SermonRow>()
  if (!row) throw new AppError(404, 'sermon_not_found', 'Sermon not found')
  return row
}

async function requireAudioMedia(
  db: D1Database,
  churchId: string,
  mediaId: string | null,
  requirePublic: boolean,
) {
  if (!mediaId) return
  const row = await db
    .prepare(
      `
      SELECT media_type, visibility FROM media
      WHERE church_id = ? AND id = ? AND deleted_at IS NULL
    `,
    )
    .bind(churchId, mediaId)
    .first<{ media_type: string; visibility: 'public' | 'private' }>()
  if (!row)
    throw new AppError(
      422,
      'invalid_media',
      'The selected media does not exist in this church',
    )
  if (!row.media_type.startsWith('audio')) {
    throw new AppError(
      422,
      'invalid_audio_media',
      'Sermon audio must reference an audio media object',
    )
  }
  if (requirePublic && row.visibility !== 'public') {
    throw new AppError(
      422,
      'private_published_media',
      'Published sermons require public audio media',
    )
  }
}

export const sermonRoutes = new Hono<AppEnv>()

sermonRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'sermons.write')
  const parsed = listInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)
  const conditions = ['church_id = ?', 'deleted_at IS NULL']
  const bindings: unknown[] = [churchId]
  if (parsed.data.query) {
    const pattern = `%${escapeLike(parsed.data.query)}%`
    conditions.push(`(
      title LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      speaker LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      series LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      summary LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`)
    bindings.push(pattern, pattern, pattern, pattern)
  }
  if (parsed.data.status) {
    conditions.push('status = ?')
    bindings.push(parsed.data.status)
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB.prepare(
      'SELECT preached_at, id FROM sermons WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
      .bind(churchId, parsed.data.cursor)
      .first<{ preached_at: number; id: string }>()
    if (!cursor)
      throw new AppError(422, 'invalid_cursor', 'The sermon cursor is invalid')
    conditions.push('(preached_at < ? OR (preached_at = ? AND id > ?))')
    bindings.push(cursor.preached_at, cursor.preached_at, cursor.id)
  }
  const result = await c.env.DB.prepare(
    `${sermonSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY preached_at DESC, id
      LIMIT ?
    `,
  )
    .bind(...bindings, parsed.data.limit + 1)
    .all<SermonRow>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore
    ? result.results.slice(0, parsed.data.limit)
    : result.results
  return c.json({
    sermons: rows.map(mapSermon),
    page: {
      limit: parsed.data.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  })
})

sermonRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'sermons.write')
  const parsed = sermonCreateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await requireAudioMedia(
    c.env.DB,
    churchId,
    parsed.data.audioMediaId,
    parsed.data.status === 'published',
  )
  const sermonId = `sermon_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
          INSERT INTO sermons (
            id, church_id, slug, title, status, speaker, series, summary,
            video_url, audio_media_id, preached_at, featured,
            version, created_at, updated_at, last_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `,
      ).bind(
        sermonId,
        churchId,
        parsed.data.slug,
        parsed.data.title,
        parsed.data.status,
        parsed.data.speaker,
        parsed.data.series,
        parsed.data.summary,
        parsed.data.videoUrl,
        parsed.data.audioMediaId,
        parsed.data.preachedAt,
        parsed.data.featured ? 1 : 0,
        now,
        now,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'sermon',
        entityId: sermonId,
        eventName: 'sermons.created',
        operationId,
        table: 'sermons',
        now,
        metadata: {
          status: parsed.data.status,
          preachedAt: parsed.data.preachedAt,
        },
      }),
    ])
  } catch (error) {
    if (isSlugConflict(error, 'sermons')) {
      throw new AppError(
        409,
        'sermon_slug_exists',
        'A sermon already uses this slug',
      )
    }
    throw error
  }
  broadcastContent(c, churchId, 'sermon', sermonId, 'created')
  return c.json(
    { sermon: mapSermon(await findSermon(c.env.DB, churchId, sermonId)) },
    201,
  )
})

sermonRoutes.get('/:churchId/:sermonId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'sermons.write')
  return c.json({
    sermon: mapSermon(
      await findSermon(c.env.DB, churchId, c.req.param('sermonId')),
    ),
  })
})

sermonRoutes.patch('/:churchId/:sermonId', async (c) => {
  const churchId = c.req.param('churchId')
  const sermonId = c.req.param('sermonId')
  const actor = await requirePermission(c, churchId, 'sermons.write')
  const parsed = sermonUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findSermon(c.env.DB, churchId, sermonId)
  if (current.version !== parsed.data.version) {
    throw new AppError(
      409,
      'version_conflict',
      'The sermon changed after it was loaded',
    )
  }
  const next = {
    slug: parsed.data.slug ?? current.slug,
    title: parsed.data.title ?? current.title,
    status: parsed.data.status ?? current.status,
    speaker: parsed.data.speaker ?? current.speaker,
    series:
      parsed.data.series === undefined ? current.series : parsed.data.series,
    summary: parsed.data.summary ?? current.summary,
    videoUrl:
      parsed.data.videoUrl === undefined
        ? current.video_url
        : parsed.data.videoUrl,
    audioMediaId:
      parsed.data.audioMediaId === undefined
        ? current.audio_media_id
        : parsed.data.audioMediaId,
    preachedAt: parsed.data.preachedAt ?? current.preached_at,
    featured:
      parsed.data.featured === undefined
        ? current.featured === 1
        : parsed.data.featured,
  }
  await requireAudioMedia(
    c.env.DB,
    churchId,
    next.audioMediaId,
    next.status === 'published',
  )
  const operationId = crypto.randomUUID()
  const now = Date.now()
  let results: D1Result[]
  try {
    results = await c.env.DB.batch([
      c.env.DB.prepare(
        `
          UPDATE sermons SET
            slug = ?, title = ?, status = ?, speaker = ?, series = ?, summary = ?,
            video_url = ?, audio_media_id = ?, preached_at = ?, featured = ?,
            version = version + 1, updated_at = ?, last_operation_id = ?
          WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
        `,
      ).bind(
        next.slug,
        next.title,
        next.status,
        next.speaker,
        next.series,
        next.summary,
        next.videoUrl,
        next.audioMediaId,
        next.preachedAt,
        next.featured ? 1 : 0,
        now,
        operationId,
        churchId,
        sermonId,
        current.version,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'sermon',
        entityId: sermonId,
        eventName: 'sermons.updated',
        operationId,
        table: 'sermons',
        now,
        metadata: {
          changedFields: Object.keys(parsed.data).filter(
            (key) => key !== 'version',
          ),
          status: next.status,
          preachedAt: next.preachedAt,
        },
      }),
    ])
  } catch (error) {
    if (isSlugConflict(error, 'sermons')) {
      throw new AppError(
        409,
        'sermon_slug_exists',
        'A sermon already uses this slug',
      )
    }
    throw error
  }
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The sermon changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'sermon', sermonId, 'updated')
  return c.json({
    sermon: mapSermon(await findSermon(c.env.DB, churchId, sermonId)),
  })
})

sermonRoutes.delete('/:churchId/:sermonId', async (c) => {
  const churchId = c.req.param('churchId')
  const sermonId = c.req.param('sermonId')
  const actor = await requirePermission(c, churchId, 'sermons.write')
  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await findSermon(c.env.DB, churchId, sermonId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE sermons SET deleted_at = ?, updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `,
    ).bind(now, now, operationId, churchId, sermonId, parsed.data.version),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'sermon',
      entityId: sermonId,
      eventName: 'sermons.deleted',
      operationId,
      table: 'sermons',
      now,
      metadata: { previousVersion: parsed.data.version },
    }),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The sermon changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'sermon', sermonId, 'deleted')
  return c.body(null, 204)
})
