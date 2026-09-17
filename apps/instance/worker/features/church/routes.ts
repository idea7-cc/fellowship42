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
for (const action of ['save', 'publish', 'unpublish'] as const) {
  churchSettingsRoutes.post(`/:churchId/${action}`, async (c) => {
    const churchId = c.req.param('churchId')
    const actor = await requirePermission(c, churchId, 'church.write')
    const body = await jsonBody(c)
    const parsed =
      action === 'save'
        ? saveInput.safeParse(body)
        : versionInputSchema.safeParse(body)
    if (!parsed.success) throw validationError(parsed.error)
    const settings = await readSettings(c.env.DB, churchId)
    if (settings.version !== parsed.data.version)
      throw new AppError(
        409,
        'version_conflict',
        'Church settings changed. Reload the saved draft before trying again.',
      )
    const draft =
      action === 'save' ? saveInput.parse(body).draft : settings.draft
    if (action === 'publish' && !draft.summary)
      throw new AppError(
        422,
        'profile_incomplete',
        'Add a short description before publishing.',
      )
    const images =
      action === 'unpublish'
        ? []
        : [
            ...new Set(
              [draft.logoMediaId, draft.coverMediaId].filter(
                (id): id is string => Boolean(id),
              ),
            ),
          ]
    for (const id of images) {
      const media = await c.env.DB.prepare(
        `SELECT 1 AS found FROM media WHERE church_id = ? AND id = ? AND media_type = 'image' AND deleted_at IS NULL`,
      )
        .bind(churchId, id)
        .first()
      if (!media)
        throw new AppError(
          422,
          'invalid_image',
          'Choose an available image from this church.',
        )
    }
    const operationId = crypto.randomUUID()
    const now = Date.now()
    const gate =
      'EXISTS (SELECT 1 FROM churches WHERE id = ? AND last_operation_id = ?)'
    const imageChecks = images.map(
      () =>
        `EXISTS (SELECT 1 FROM media WHERE church_id = ? AND id = ? AND media_type = 'image' AND deleted_at IS NULL)`,
    )
    const statements = [
      c.env.DB.prepare(
        `UPDATE churches SET
      name = CASE WHEN ? THEN ? ELSE name END,
      timezone = CASE WHEN ? THEN ? ELSE timezone END,
      status = CASE WHEN ? = 'publish' THEN 'published' WHEN ? = 'unpublish' THEN 'draft' ELSE status END,
      version = version + 1, updated_at = ?, last_operation_id = ?
      WHERE id = ? AND version = ? AND deleted_at IS NULL ${imageChecks.length ? `AND ${imageChecks.join(' AND ')}` : ''}`,
      ).bind(
        Number(action === 'publish'),
        draft.name,
        Number(action === 'publish'),
        draft.timezone,
        action,
        action,
        now,
        operationId,
        churchId,
        parsed.data.version,
        ...images.flatMap((id) => [churchId, id]),
      ),
    ]
    if (action === 'save') {
      statements.push(
        c.env.DB.prepare(
          `UPDATE church_profiles SET draft_json = ?, updated_at = ? WHERE church_id = ? AND ${gate}`,
        ).bind(JSON.stringify(draft), now, churchId, churchId, operationId),
      )
    }
    if (action === 'publish') {
      statements.push(
        c.env.DB.prepare(
          `UPDATE church_profiles SET draft_json = NULL, tagline = ?, summary = ?, street = ?, city = ?, region = ?, postal_code = ?, country_code = ?, phone = ?, email = ?, website_url = ?, giving_url = ?, livestream_url = ?, theme_preset = ?, theme_accent = NULL, theme_surface = NULL, theme_ink = NULL, theme_hero_tone = NULL, theme_radius = NULL, theme_heading_font = NULL, theme_body_font = NULL, logo_media_id = ?, cover_media_id = ?, updated_at = ? WHERE church_id = ? AND ${gate}`,
        ).bind(
          draft.tagline,
          draft.summary,
          draft.street,
          draft.city,
          draft.region,
          draft.postalCode,
          draft.countryCode,
          draft.phone || null,
          draft.email || null,
          draft.websiteUrl || null,
          draft.givingUrl || null,
          draft.livestreamUrl || null,
          draft.themePreset,
          draft.logoMediaId,
          draft.coverMediaId,
          now,
          churchId,
          churchId,
          operationId,
        ),
      )
      statements.push(
        c.env.DB.prepare(
          `DELETE FROM service_times WHERE church_id = ? AND ${gate}`,
        ).bind(churchId, churchId, operationId),
      )
      draft.serviceTimes.forEach((time, index) =>
        statements.push(
          c.env.DB.prepare(
            `INSERT INTO service_times (id, church_id, label, day_of_week, local_time, sort_order, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate}`,
          ).bind(
            crypto.randomUUID(),
            churchId,
            time.label,
            time.day,
            time.time,
            index,
            now,
            now,
            churchId,
            operationId,
          ),
        ),
      )
      for (const id of images)
        statements.push(
          c.env.DB.prepare(
            `UPDATE media SET visibility = 'public', version = version + 1, updated_at = ? WHERE church_id = ? AND id = ? AND visibility = 'private' AND ${gate}`,
          ).bind(now, churchId, id, churchId, operationId),
        )
    }
    const eventName = `church.${action === 'save' ? 'draft_saved' : action === 'publish' ? 'published' : 'unpublished'}`
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO audit_events (id, church_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json, occurred_at) SELECT ?, ?, ?, ?, 'church', ?, ?, '{}', ? WHERE ${gate}`,
      ).bind(
        crypto.randomUUID(),
        churchId,
        actor.id,
        eventName,
        churchId,
        c.get('requestId'),
        now,
        churchId,
        operationId,
      ),
    )
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO outbox_events (id, church_id, topic, aggregate_type, aggregate_id, payload_json, status, available_at, created_at) SELECT ?, ?, ?, 'church', ?, '{}', 'pending', ?, ? WHERE ${gate}`,
      ).bind(
        crypto.randomUUID(),
        churchId,
        eventName,
        churchId,
        now,
        now,
        churchId,
        operationId,
      ),
    )
    const results = await c.env.DB.batch(statements)
    if (results[0].meta.changes !== 1)
      throw new AppError(
        409,
        'version_conflict',
        'The church or selected images changed. Reload the saved draft before trying again.',
      )
    broadcastContent(c, churchId, 'church', churchId, 'updated')
    return c.json(await readSettings(c.env.DB, churchId))
  })
}
