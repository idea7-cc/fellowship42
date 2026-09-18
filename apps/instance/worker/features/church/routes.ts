import { Hono } from 'hono'
import { z } from 'zod'
import { churchDraftSchema } from '../../../contracts/church-settings'
import { requirePermission, type AccessIdentity } from '../../lib/auth'
import {
  broadcastContent,
  jsonBody,
  validationError,
  versionInputSchema,
} from '../../lib/content'
import { AppError } from '../../lib/errors'
import { mutateChurch } from './service'
import { draftChurch, readSettings, readSite } from './read'

type AppEnv = {
  Bindings: Env
  Variables: { identity: AccessIdentity | null; requestId: string }
}
export const churchSettingsRoutes = new Hono<AppEnv>()
export const siteRoutes = new Hono<AppEnv>()

siteRoutes.get('/', async (c) => {
  c.header('Cache-Control', 'no-store')
  const instance = await c.env.DB.prepare(
    `SELECT c.id FROM instance_metadata i JOIN churches c ON c.id = i.primary_church_id WHERE i.singleton = 1 AND c.status = 'published' AND c.deleted_at IS NULL`,
  ).first<{ id: string }>()
  if (!instance)
    throw new AppError(
      404,
      'site_unpublished',
      'This website is not published yet',
    )
  return c.json(await readSite(c.env.DB, instance.id))
})

churchSettingsRoutes.use('/:churchId/*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store')
  await requirePermission(c, c.req.param('churchId'), 'church.write')
  await next()
})
churchSettingsRoutes.get('/:churchId', async (c) =>
  c.json(await readSettings(c.env.DB, c.req.param('churchId'))),
)
churchSettingsRoutes.get('/:churchId/preview', async (c) => {
  const id = c.req.param('churchId')
  const settings = await readSettings(c.env.DB, id)
  const site = await readSite(c.env.DB, id)
  return c.json({ ...site, church: draftChurch(site.church, settings.draft) })
})
churchSettingsRoutes.get('/:churchId/images', async (c) => {
  const parsed = z
    .object({ cursor: z.string().max(128).optional() })
    .safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)
  const rows = await c.env.DB.prepare(
    `SELECT id, alt_text FROM media WHERE church_id = ? AND media_type = 'image' AND deleted_at IS NULL AND id > ? ORDER BY id LIMIT 13`,
  )
    .bind(c.req.param('churchId'), parsed.data.cursor ?? '')
    .all<{ id: string; alt_text: string }>()
  const items = rows.results.slice(0, 12)
  return c.json({
    images: items.map((row) => ({ id: row.id, altText: row.alt_text })),
    nextCursor: rows.results.length > 12 ? items.at(-1)!.id : null,
  })
})
churchSettingsRoutes.get('/:churchId/images/:mediaId', async (c) => {
  const image = await c.env.DB.prepare(
    `SELECT r2_key, content_type FROM media WHERE church_id = ? AND id = ? AND media_type = 'image' AND deleted_at IS NULL`,
  )
    .bind(c.req.param('churchId'), c.req.param('mediaId'))
    .first<{ r2_key: string; content_type: string }>()
  if (!image) throw new AppError(404, 'image_not_found', 'Image not found')
  const object = await c.env.MEDIA.get(image.r2_key)
  if (!object) throw new AppError(404, 'image_not_found', 'Image not found')
  return new Response(object.body, {
    headers: {
      'Content-Type': image.content_type,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

const saveInput = z
  .object({ version: z.number().int().positive(), draft: churchDraftSchema })
  .strict()
for (const action of ['save', 'publish', 'unpublish', 'restore'] as const) {
  churchSettingsRoutes.post(`/:churchId/${action}`, async (c) => {
    const churchId = c.req.param('churchId')
    const actor = await requirePermission(c, churchId, 'church.write')
    const body = await jsonBody(c)
    const parsed =
      action === 'save'
        ? saveInput.safeParse(body)
        : versionInputSchema.safeParse(body)
    if (!parsed.success) throw validationError(parsed.error)
    const result = await mutateChurch(
      c.env.DB,
      churchId,
      {
        userId: actor.id,
        requestId: c.get('requestId'),
      },
      action,
      parsed.data.version,
      action === 'save' ? saveInput.parse(body).draft : undefined,
    )
    broadcastContent(c, churchId, 'church', churchId, 'updated')
    return c.json(result)
  })
}
