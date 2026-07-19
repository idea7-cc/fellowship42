import { Hono } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../lib/auth'
import {
  broadcastContent,
  jsonBody,
  mutationEvidence,
  validationError,
  versionInputSchema,
} from '../lib/content'
import { AppError } from '../lib/errors'
import type { MediaRecord } from '../../src/lib/api-types'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

interface MediaRow {
  id: string
  church_id: string
  r2_key: string
  media_type: string
  content_type: string
  byte_size: number
  checksum: string | null
  alt_text: string
  visibility: MediaRecord['visibility']
  created_at: number
  version: number
}

const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const supportedContentTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'application/pdf',
])
const uploadMetadataSchema = z
  .object({
    visibility: z.enum(['public', 'private']).default('private'),
    altText: z.string().trim().max(500).default(''),
  })
  .strict()
const mediaUpdateInput = z
  .object({
    version: z.number().int().positive(),
    visibility: z.enum(['public', 'private']).optional(),
    altText: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), {
    message: 'At least one media field must be changed',
  })
const listInput = z.object({
  visibility: z.enum(['public', 'private']).optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

function mediaTypeFor(contentType: string) {
  if (contentType === 'application/pdf') return 'document'
  return contentType.split('/')[0]!
}

function mapMedia(row: MediaRow): MediaRecord {
  return {
    id: row.id,
    churchId: row.church_id,
    mediaType: row.media_type,
    contentType: row.content_type,
    byteSize: row.byte_size,
    checksum: row.checksum ?? undefined,
    altText: row.alt_text,
    visibility: row.visibility,
    createdAt: row.created_at,
    version: row.version,
    url:
      row.visibility === 'public'
        ? `/media/${encodeURIComponent(row.id)}`
        : undefined,
  }
}

async function findMedia(db: D1Database, churchId: string, mediaId: string) {
  const row = await db
    .prepare(
      `
      SELECT id, church_id, r2_key, media_type, content_type, byte_size,
             checksum, alt_text, visibility, created_at, version
      FROM media
      WHERE church_id = ? AND id = ? AND deleted_at IS NULL
    `,
    )
    .bind(churchId, mediaId)
    .first<MediaRow>()
  if (!row) throw new AppError(404, 'media_not_found', 'Media not found')
  return row
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function requireNotPublished(
  db: D1Database,
  churchId: string,
  mediaId: string,
) {
  const reference = await db
    .prepare(
      `
      SELECT 'course' AS kind
      FROM lessons l
      JOIN courses c ON c.church_id = l.church_id AND c.id = l.course_id
      WHERE l.church_id = ? AND l.media_id = ?
        AND c.status = 'published' AND c.deleted_at IS NULL
      UNION ALL
      SELECT 'sermon' AS kind
      FROM sermons s
      WHERE s.church_id = ? AND s.audio_media_id = ?
        AND s.status = 'published' AND s.deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(churchId, mediaId, churchId, mediaId)
    .first<{ kind: string }>()
  if (reference) {
    throw new AppError(
      409,
      'media_is_published',
      `Media is referenced by a published ${reference.kind}`,
    )
  }
}

export const mediaRoutes = new Hono<AppEnv>()

mediaRoutes.get('/:mediaId', async (c) => {
  const media = await c.env.DB.prepare(
    `
      SELECT r2_key, content_type
      FROM media
      WHERE id = ? AND visibility = 'public' AND deleted_at IS NULL
    `,
  )
    .bind(c.req.param('mediaId'))
    .first<{ r2_key: string; content_type: string }>()
  if (!media) throw new AppError(404, 'media_not_found', 'Media not found')

  const object = await c.env.MEDIA.get(media.r2_key, {
    onlyIf: c.req.raw.headers,
    range: c.req.raw.headers,
  })
  if (!object) throw new AppError(404, 'media_not_found', 'Media not found')

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', media.content_type)
  headers.set('ETag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=300, must-revalidate')
  headers.set('Accept-Ranges', 'bytes')
  if (object.range) {
    const range = object.range as {
      offset?: number
      length?: number
      suffix?: number
    }
    const offset =
      typeof range.suffix === 'number'
        ? Math.max(0, object.size - range.suffix)
        : (range.offset ?? 0)
    const length =
      typeof range.suffix === 'number'
        ? Math.min(object.size, range.suffix)
        : (range.length ?? object.size - offset)
    headers.set(
      'Content-Range',
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    )
  }
  if (!('body' in object)) return new Response(null, { status: 412, headers })
  return new Response(object.body, {
    status: object.range ? 206 : 200,
    headers,
  })
})

export const mediaManagementRoutes = new Hono<AppEnv>()

mediaManagementRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'media.write')
  const parsed = listInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)
  const conditions = ['church_id = ?', 'deleted_at IS NULL']
  const bindings: unknown[] = [churchId]
  if (parsed.data.visibility) {
    conditions.push('visibility = ?')
    bindings.push(parsed.data.visibility)
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB.prepare(
      'SELECT created_at, id FROM media WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
      .bind(churchId, parsed.data.cursor)
      .first<{ created_at: number; id: string }>()
    if (!cursor)
      throw new AppError(422, 'invalid_cursor', 'The media cursor is invalid')
    conditions.push('(created_at < ? OR (created_at = ? AND id > ?))')
    bindings.push(cursor.created_at, cursor.created_at, cursor.id)
  }
  const result = await c.env.DB.prepare(
    `
      SELECT id, church_id, r2_key, media_type, content_type, byte_size,
             checksum, alt_text, visibility, created_at, version
      FROM media
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC, id
      LIMIT ?
    `,
  )
    .bind(...bindings, parsed.data.limit + 1)
    .all<MediaRow>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore
    ? result.results.slice(0, parsed.data.limit)
    : result.results
  return c.json({
    media: rows.map(mapMedia),
    page: {
      limit: parsed.data.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  })
})

mediaManagementRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'media.write')
  const metadata = uploadMetadataSchema.safeParse(c.req.query())
  if (!metadata.success) throw validationError(metadata.error)
  const contentType = (c.req.header('content-type') ?? '')
    .split(';')[0]!
    .trim()
    .toLowerCase()
  if (!supportedContentTypes.has(contentType)) {
    throw new AppError(
      415,
      'unsupported_media_type',
      'This media content type is not supported',
    )
  }
  const contentLength = Number(c.req.header('content-length') ?? 0)
  if (contentLength > MAX_MEDIA_BYTES) {
    throw new AppError(
      413,
      'media_too_large',
      'Media uploads are limited to 20 MiB',
    )
  }
  const body = await c.req.arrayBuffer()
  if (body.byteLength === 0)
    throw new AppError(422, 'empty_media', 'Choose a non-empty media file')
  if (body.byteLength > MAX_MEDIA_BYTES) {
    throw new AppError(
      413,
      'media_too_large',
      'Media uploads are limited to 20 MiB',
    )
  }
  const checksum = hex(await crypto.subtle.digest('SHA-256', body))
  const requestedChecksum = c.req.header('x-f42-sha256')?.trim().toLowerCase()
  if (requestedChecksum && requestedChecksum !== checksum) {
    throw new AppError(
      422,
      'media_checksum_mismatch',
      'The upload checksum does not match its bytes',
    )
  }

  const mediaId = `media_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const r2Key = `churches/${churchId}/media/${mediaId}`
  await c.env.MEDIA.put(r2Key, body, {
    httpMetadata: {
      contentType,
      contentDisposition:
        contentType === 'application/pdf' ? 'attachment' : 'inline',
      cacheControl: 'public, max-age=300, must-revalidate',
    },
    customMetadata: { checksumSha256: checksum },
    sha256: checksum,
  })

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
          INSERT INTO media (
            id, church_id, r2_key, media_type, content_type, byte_size, checksum,
            alt_text, visibility, created_by_user_id, created_at, updated_at,
            version, last_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `,
      ).bind(
        mediaId,
        churchId,
        r2Key,
        mediaTypeFor(contentType),
        contentType,
        body.byteLength,
        checksum,
        metadata.data.altText,
        metadata.data.visibility,
        actor.id,
        now,
        now,
        operationId,
      ),
      ...mutationEvidence(c.env.DB, {
        churchId,
        actorId: actor.id,
        requestId: c.get('requestId'),
        entityType: 'media',
        entityId: mediaId,
        eventName: 'media.created',
        operationId,
        table: 'media',
        now,
        metadata: {
          mediaType: mediaTypeFor(contentType),
          visibility: metadata.data.visibility,
          byteSize: body.byteLength,
        },
      }),
    ])
  } catch (error) {
    await c.env.MEDIA.delete(r2Key)
    throw error
  }
  broadcastContent(c, churchId, 'media', mediaId, 'created')
  return c.json(
    { media: mapMedia(await findMedia(c.env.DB, churchId, mediaId)) },
    201,
  )
})

mediaManagementRoutes.patch('/:churchId/:mediaId', async (c) => {
  const churchId = c.req.param('churchId')
  const mediaId = c.req.param('mediaId')
  const actor = await requirePermission(c, churchId, 'media.write')
  const parsed = mediaUpdateInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findMedia(c.env.DB, churchId, mediaId)
  if (current.version !== parsed.data.version) {
    throw new AppError(
      409,
      'version_conflict',
      'The media record changed after it was loaded',
    )
  }
  const nextVisibility = parsed.data.visibility ?? current.visibility
  if (nextVisibility === 'private' && current.visibility === 'public') {
    await requireNotPublished(c.env.DB, churchId, mediaId)
  }
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE media SET alt_text = ?, visibility = ?, version = version + 1,
          updated_at = ?, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `,
    ).bind(
      parsed.data.altText ?? current.alt_text,
      nextVisibility,
      now,
      operationId,
      churchId,
      mediaId,
      current.version,
    ),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'media',
      entityId: mediaId,
      eventName: 'media.updated',
      operationId,
      table: 'media',
      now,
      metadata: {
        changedFields: Object.keys(parsed.data).filter(
          (key) => key !== 'version',
        ),
        visibility: nextVisibility,
      },
    }),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The media record changed after it was loaded',
    )
  }
  broadcastContent(c, churchId, 'media', mediaId, 'updated')
  return c.json({
    media: mapMedia(await findMedia(c.env.DB, churchId, mediaId)),
  })
})

mediaManagementRoutes.delete('/:churchId/:mediaId', async (c) => {
  const churchId = c.req.param('churchId')
  const mediaId = c.req.param('mediaId')
  const actor = await requirePermission(c, churchId, 'media.write')
  const parsed = versionInputSchema.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  const current = await findMedia(c.env.DB, churchId, mediaId)
  await requireNotPublished(c.env.DB, churchId, mediaId)
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        UPDATE media SET deleted_at = ?, updated_at = ?, version = version + 1, last_operation_id = ?
        WHERE church_id = ? AND id = ? AND deleted_at IS NULL AND version = ?
      `,
    ).bind(now, now, operationId, churchId, mediaId, parsed.data.version),
    ...mutationEvidence(c.env.DB, {
      churchId,
      actorId: actor.id,
      requestId: c.get('requestId'),
      entityType: 'media',
      entityId: mediaId,
      eventName: 'media.deleted',
      operationId,
      table: 'media',
      now,
      metadata: { previousVersion: parsed.data.version },
    }),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'version_conflict',
      'The media record changed after it was loaded',
    )
  }
  c.executionCtx.waitUntil(c.env.MEDIA.delete(current.r2_key))
  broadcastContent(c, churchId, 'media', mediaId, 'deleted')
  return c.body(null, 204)
})
