import type {
  ChurchSettings,
  ChurchSite,
  ChurchDraft,
} from '../../../contracts/church-settings'
import {
  churchDraftSchema,
  draftAttributionSchema,
} from '../../../contracts/church-settings'
import { AppError } from '../../lib/errors'
import {
  churchSelect,
  mapChurch,
  mapCourse,
  mapEvent,
  mapGroup,
  mapSermon,
  type ChurchRow,
  type ServiceTimeRow,
  type CourseRow,
  type EventRow,
  type GroupRow,
  type SermonRow,
} from '../../lib/records'

export async function readChurch(db: D1Database, churchId: string) {
  // Read the profile, its version, and gatherings in one D1 snapshot.
  const [profile, times] = await db.batch([
    db
      .prepare(`${churchSelect} WHERE c.id = ? AND c.deleted_at IS NULL`)
      .bind(churchId),
    db
      .prepare(
        'SELECT id, label, day_of_week, local_time FROM service_times WHERE church_id = ? ORDER BY sort_order, id',
      )
      .bind(churchId),
  ])
  const row = profile.results[0] as unknown as ChurchRow | undefined
  if (!row) throw new AppError(404, 'church_not_found', 'Church not found')
  return {
    row,
    church: mapChurch(row, times.results as unknown as ServiceTimeRow[]),
  }
}

export async function readSettings(
  db: D1Database,
  churchId: string,
): Promise<ChurchSettings> {
  const { row, church } = await readChurch(db, churchId)
  const baseline = churchDraftSchema.parse({
    name: row.name,
    tagline: row.tagline,
    summary: row.summary,
    timezone: row.timezone,
    street: row.street,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    phone: row.phone ?? '',
    email: row.email ?? '',
    websiteUrl: row.website_url ?? '',
    givingUrl: row.giving_url ?? '',
    livestreamUrl: row.livestream_url ?? '',
    themePreset: row.theme_preset,
    logoMediaId: row.logo_media_id,
    coverMediaId: row.cover_media_id,
    serviceTimes: church.serviceTimes.map(({ label, day, time }) => ({
      label,
      day,
      time,
    })),
  })
  const draft = row.draft_json
    ? churchDraftSchema.parse(JSON.parse(row.draft_json))
    : baseline
  const content = await db
    .prepare(
      `SELECT (
    EXISTS(SELECT 1 FROM groups WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL) OR
    EXISTS(SELECT 1 FROM courses WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL) OR
    EXISTS(SELECT 1 FROM events WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL) OR
    EXISTS(SELECT 1 FROM sermons WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL)
  ) AS ready`,
    )
    .bind(churchId, churchId, churchId, churchId)
    .first<{ ready: number }>()
  return {
    draft,
    review: {
      baseline,
      canRestore: row.previous_draft_json !== null,
      changedBy: row.draft_attribution_json
        ? draftAttributionSchema.parse(JSON.parse(row.draft_attribution_json))
        : null,
    },
    version: row.version,
    published: row.status === 'published',
    hasDraft: row.draft_json !== null,
    readiness: {
      profile: Boolean(draft.name && draft.summary),
      services: draft.serviceTimes.length > 0,
      content: Boolean(content?.ready),
    },
  }
}

export function draftChurch(
  church: ChurchSite['church'],
  draft: ChurchDraft,
): ChurchSite['church'] {
  const image = (id: string | null) =>
    id
      ? `/api/church-settings/${encodeURIComponent(church.id)}/images/${encodeURIComponent(id)}`
      : undefined
  return {
    ...church,
    name: draft.name,
    tagline: draft.tagline,
    summary: draft.summary,
    timezone: draft.timezone,
    address: {
      street: draft.street,
      city: draft.city,
      state: draft.region,
      postalCode: draft.postalCode,
      countryCode: draft.countryCode,
    },
    contact: {
      phone: draft.phone,
      email: draft.email,
      website: draft.websiteUrl,
    },
    givingUrl: draft.givingUrl,
    livestreamUrl: draft.livestreamUrl,
    theme: { preset: draft.themePreset },
    logoUrl: image(draft.logoMediaId),
    coverUrl: image(draft.coverMediaId),
    serviceTimes: draft.serviceTimes.map((time, index) => ({
      ...time,
      id: String(index),
    })),
  }
}

export async function readSite(
  db: D1Database,
  churchId: string,
): Promise<ChurchSite> {
  const { church } = await readChurch(db, churchId)
  const [groups, courses, events, sermons] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM groups WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL ORDER BY featured DESC, title LIMIT 200`,
      )
      .bind(churchId)
      .all<GroupRow>(),
    db
      .prepare(
        `SELECT c.*, COUNT(l.id) AS lesson_count FROM courses c LEFT JOIN lessons l ON l.church_id = c.church_id AND l.course_id = c.id WHERE c.church_id = ? AND c.status = 'published' AND c.deleted_at IS NULL GROUP BY c.id ORDER BY c.featured DESC, c.title LIMIT 200`,
      )
      .bind(churchId)
      .all<CourseRow>(),
    db
      .prepare(
        `SELECT * FROM events WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL AND starts_at >= ? ORDER BY starts_at LIMIT 200`,
      )
      .bind(churchId, Date.now())
      .all<EventRow>(),
    db
      .prepare(
        `SELECT * FROM sermons WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL ORDER BY preached_at DESC LIMIT 200`,
      )
      .bind(churchId)
      .all<SermonRow>(),
  ])
  return {
    church,
    groups: groups.results.map(mapGroup),
    courses: courses.results.map(mapCourse),
    events: events.results.map(mapEvent),
    sermons: sermons.results.map(mapSermon),
  }
}
