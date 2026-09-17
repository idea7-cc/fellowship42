import type { ChurchDraft } from '../../../contracts/church-settings'
import { AppError } from '../../lib/errors'
import { readSettings } from './read'

// Reused inside conditional writes, so role removal, suspension, and grant
// revocation cannot race a checked read into an unauthorized mutation.
export function churchWriteGate(churchColumn: string) {
  return `EXISTS (SELECT 1 FROM church_memberships cm
    JOIN users u ON u.id = cm.user_id
    JOIN membership_roles mr ON mr.church_id = cm.church_id AND mr.membership_id = cm.id
    JOIN role_permissions rp ON rp.role_id = mr.role_id
    WHERE cm.church_id = ${churchColumn} AND cm.user_id = ?
      AND cm.status = 'active' AND u.status = 'active'
      AND rp.permission IN ('*', 'church.write'))`
}

export interface ChurchActor {
  userId: string
  requestId: string
  connectionId?: string
  clientId?: string
}

export async function mutateChurch(
  db: D1Database,
  churchId: string,
  actor: ChurchActor,
  action: 'save' | 'publish' | 'unpublish',
  version: number,
  inputDraft?: ChurchDraft,
) {
  if (actor.connectionId && action !== 'save')
    throw new AppError(
      403,
      'agent_publish_denied',
      'Publish from the church app.',
    )
  const settings = await readSettings(db, churchId)
  if (settings.version !== version)
    throw new AppError(
      409,
      'version_conflict',
      'Church settings changed. Reload the saved draft before trying again.',
    )
  const draft = action === 'save' ? inputDraft! : settings.draft
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
            [draft.logoMediaId, draft.coverMediaId].filter((id): id is string =>
              Boolean(id),
            ),
          ),
        ]
  for (const id of images) {
    const media = await db
      .prepare(
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
    db
      .prepare(
        `UPDATE churches SET
      name = CASE WHEN ? THEN ? ELSE name END,
      timezone = CASE WHEN ? THEN ? ELSE timezone END,
      status = CASE WHEN ? = 'publish' THEN 'published' WHEN ? = 'unpublish' THEN 'draft' ELSE status END,
      version = version + 1, updated_at = ?, last_operation_id = ?
      WHERE id = ? AND version = ? AND deleted_at IS NULL
      AND ${churchWriteGate('churches.id')}
      AND (? IS NULL OR EXISTS (SELECT 1 FROM agent_connections ac WHERE ac.id = ? AND ac.church_id = churches.id AND ac.user_id = ? AND ac.revoked_at IS NULL AND ac.expires_at > ? AND EXISTS (SELECT 1 FROM json_each(ac.scopes_json) WHERE value = 'draft:write')))
      ${imageChecks.length ? `AND ${imageChecks.join(' AND ')}` : ''}`,
      )
      .bind(
        Number(action === 'publish'),
        draft.name,
        Number(action === 'publish'),
        draft.timezone,
        action,
        action,
        now,
        operationId,
        churchId,
        version,
        actor.userId,
        actor.connectionId ?? null,
        actor.connectionId ?? null,
        actor.userId,
        now,
        ...images.flatMap((id) => [churchId, id]),
      ),
  ]
  if (action === 'save') {
    statements.push(
      db
        .prepare(
          `UPDATE church_profiles SET draft_json = ?, updated_at = ? WHERE church_id = ? AND ${gate}`,
        )
        .bind(JSON.stringify(draft), now, churchId, churchId, operationId),
    )
  }
  if (action === 'publish') {
    statements.push(
      db
        .prepare(
          `UPDATE church_profiles SET draft_json = NULL, tagline = ?, summary = ?, street = ?, city = ?, region = ?, postal_code = ?, country_code = ?, phone = ?, email = ?, website_url = ?, giving_url = ?, livestream_url = ?, theme_preset = ?, theme_accent = NULL, theme_surface = NULL, theme_ink = NULL, theme_hero_tone = NULL, theme_radius = NULL, theme_heading_font = NULL, theme_body_font = NULL, logo_media_id = ?, cover_media_id = ?, updated_at = ? WHERE church_id = ? AND ${gate}`,
        )
        .bind(
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
      db
        .prepare(`DELETE FROM service_times WHERE church_id = ? AND ${gate}`)
        .bind(churchId, churchId, operationId),
    )
    draft.serviceTimes.forEach((time, index) =>
      statements.push(
        db
          .prepare(
            `INSERT INTO service_times (id, church_id, label, day_of_week, local_time, sort_order, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate}`,
          )
          .bind(
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
        db
          .prepare(
            `UPDATE media SET visibility = 'public', version = version + 1, updated_at = ? WHERE church_id = ? AND id = ? AND visibility = 'private' AND ${gate}`,
          )
          .bind(now, churchId, id, churchId, operationId),
      )
  }
  const eventName = `church.${action === 'save' ? 'draft_saved' : action === 'publish' ? 'published' : 'unpublished'}`
  statements.push(
    db
      .prepare(
        `INSERT INTO audit_events (id, church_id, actor_user_id, action, entity_type, entity_id, request_id, metadata_json, occurred_at) SELECT ?, ?, ?, ?, 'church', ?, ?, ?, ? WHERE ${gate}`,
      )
      .bind(
        crypto.randomUUID(),
        churchId,
        actor.userId,
        eventName,
        churchId,
        actor.requestId,
        JSON.stringify(
          actor.connectionId
            ? { connectionId: actor.connectionId, clientId: actor.clientId }
            : {},
        ),
        now,
        churchId,
        operationId,
      ),
  )
  statements.push(
    db
      .prepare(
        `INSERT INTO outbox_events (id, church_id, topic, aggregate_type, aggregate_id, payload_json, status, available_at, created_at) SELECT ?, ?, ?, 'church', ?, '{}', 'pending', ?, ? WHERE ${gate}`,
      )
      .bind(
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
  const results = await db.batch(statements)
  if (results[0].meta.changes !== 1)
    throw new AppError(
      409,
      'version_conflict',
      'The church or selected images changed. Reload the saved draft before trying again.',
    )
  return readSettings(db, churchId)
}
