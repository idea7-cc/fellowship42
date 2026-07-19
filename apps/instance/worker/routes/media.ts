import { Hono } from 'hono'
import { AppError } from '../lib/errors'

export const mediaRoutes = new Hono<{ Bindings: Env }>()

mediaRoutes.get('/:mediaId', async (c) => {
  const media = await c.env.DB
    .prepare(`
      SELECT r2_key, content_type
      FROM media
      WHERE id = ? AND visibility = 'public' AND deleted_at IS NULL
    `)
    .bind(c.req.param('mediaId'))
    .first<{ r2_key: string; content_type: string }>()
  if (!media) throw new AppError(404, 'media_not_found', 'Media not found')

  const object = await c.env.MEDIA.get(media.r2_key)
  if (!object) throw new AppError(404, 'media_not_found', 'Media not found')

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', media.content_type)
  headers.set('ETag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  return new Response(object.body, { headers })
})
