import {
  MAX_CURSOR_LENGTH,
  WEBSITE_CONTRACT,
  WEBSITE_CONTRACT_VERSION,
  type ChurchProfile,
  type ContractEnvelope,
  type CourseItem,
  type EventItem,
  type GroupItem,
  type ListResource,
  type ListResources,
  type SermonItem,
} from '@fellowship42/website-contract'
import { portableInstanceIdSchema } from '@fellowship42/management-protocol'
import { AppError } from '../../lib/errors'

/**
 * Reads for the public website contract. Every query is scoped to the
 * instance's primary church and returns only published, undeleted records
 * mapped through an explicit field allowlist. Nothing here reads identity.
 */

export interface WebsiteSite {
  envelope: ContractEnvelope
  churchId: string | null
  published: boolean
  church: { name: string; slug: string } | null
}

async function sha256Hex(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  )
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function readWebsiteSite(env: Env): Promise<WebsiteSite> {
  const row = await env.DB.prepare(
    `
      SELECT i.instance_id, c.id, c.slug, c.name, c.status
      FROM instance_metadata i
      LEFT JOIN churches c ON c.id = i.primary_church_id AND c.deleted_at IS NULL
      WHERE i.singleton = 1
    `,
  ).first<{
    instance_id: string
    id: string | null
    slug: string | null
    name: string | null
    status: string | null
  }>()
  // Before bootstrap the configured identity is the one health also reports.
  const identity = portableInstanceIdSchema.safeParse(
    row?.instance_id ?? env.F42_PORTABLE_INSTANCE_ID?.trim(),
  )
  if (!identity.success)
    throw new AppError(
      503,
      'instance_unconfigured',
      'This instance has no valid portable identity',
    )
  const published = Boolean(row?.id && row.status === 'published')
  return {
    envelope: {
      contract: WEBSITE_CONTRACT,
      version: WEBSITE_CONTRACT_VERSION,
      instance: { portableIdentitySha256: await sha256Hex(identity.data) },
    },
    churchId: row?.id ?? null,
    published,
    church:
      published && row?.name && row.slug
        ? { name: row.name, slug: row.slug }
        : null,
  }
}

const emptyToNull = (value: string | null | undefined) =>
  value && value.trim() ? value : null

const mediaUrl = (origin: string, id: string) =>
  `${origin}/media/${encodeURIComponent(id)}`

export async function readWebsiteChurch(
  db: D1Database,
  churchId: string,
  origin: string,
): Promise<ChurchProfile> {
  const [profile, times, images] = await db.batch([
    db
      .prepare(
        `
          SELECT c.name, c.slug, c.timezone, p.tagline, p.summary, p.street,
            p.city, p.region, p.postal_code, p.country_code, p.phone, p.email,
            p.website_url, p.giving_url, p.livestream_url, p.logo_media_id,
            p.cover_media_id, p.theme_preset
          FROM churches c
          JOIN church_profiles p ON p.church_id = c.id
          WHERE c.id = ? AND c.status = 'published' AND c.deleted_at IS NULL
        `,
      )
      .bind(churchId),
    db
      .prepare(
        'SELECT label, day_of_week, local_time FROM service_times WHERE church_id = ? ORDER BY sort_order, id',
      )
      .bind(churchId),
    db
      .prepare(
        `
          SELECT m.id, m.alt_text
          FROM media m
          JOIN church_profiles p ON p.church_id = m.church_id
          WHERE m.church_id = ? AND m.visibility = 'public' AND m.deleted_at IS NULL
            AND m.id IN (p.logo_media_id, p.cover_media_id)
        `,
      )
      .bind(churchId),
  ])
  const row = profile.results[0] as
    | {
        name: string
        slug: string
        timezone: string
        tagline: string
        summary: string
        street: string
        city: string
        region: string
        postal_code: string
        country_code: string
        phone: string | null
        email: string | null
        website_url: string | null
        giving_url: string | null
        livestream_url: string | null
        logo_media_id: string | null
        cover_media_id: string | null
        theme_preset: string
      }
    | undefined
  if (!row)
    throw new AppError(404, 'site_unpublished', 'This website is not published')
  const publicImages = new Map(
    (images.results as { id: string; alt_text: string }[]).map((image) => [
      image.id,
      image.alt_text,
    ]),
  )
  const image = (id: string | null) =>
    id && publicImages.has(id)
      ? { url: mediaUrl(origin, id), alt: publicImages.get(id) ?? '' }
      : null
  return {
    name: row.name,
    slug: row.slug,
    tagline: row.tagline,
    summary: row.summary,
    timezone: row.timezone,
    address: {
      street: row.street,
      city: row.city,
      region: row.region,
      postalCode: row.postal_code,
      countryCode: row.country_code,
    },
    contact: {
      phone: emptyToNull(row.phone),
      email: emptyToNull(row.email),
      website: emptyToNull(row.website_url),
    },
    links: {
      giving: emptyToNull(row.giving_url),
      livestream: emptyToNull(row.livestream_url),
    },
    logo: image(row.logo_media_id),
    cover: image(row.cover_media_id),
    theme: { preset: row.theme_preset },
    serviceTimes: (
      times.results as {
        label: string
        day_of_week: number
        local_time: string
      }[]
    ).map((time) => ({
      label: time.label,
      day: time.day_of_week,
      time: time.local_time,
    })),
  }
}

type CursorValue = string | number | null
/** `title` is a string, or null when the anchor's title did not fit. */
type CursorSlot = 'string' | 'number' | 'title'

const CURSOR = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_CURSOR_LENGTH}}$`)

const invalidCursor = () =>
  new AppError(400, 'invalid_cursor', 'This page cursor is not valid')

/**
 * A cursor is base64url over the UTF-8 JSON of `[resource, ...key]`, so any
 * title can be a key and a cursor from another route is refused. Returns null
 * when the result would be longer than the contract allows.
 */
function encodeCursor(resource: ListResource, key: CursorValue[]) {
  let binary = ''
  for (const byte of new TextEncoder().encode(
    JSON.stringify([resource, ...key]),
  ))
    binary += String.fromCharCode(byte)
  const cursor = btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return cursor.length <= MAX_CURSOR_LENGTH ? cursor : null
}

function decodeCursor(
  cursor: string,
  resource: ListResource,
  shape: CursorSlot[],
) {
  if (!CURSOR.test(cursor)) throw invalidCursor()
  let values: unknown
  try {
    const binary = atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))
    values = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    ) as unknown
  } catch {
    throw invalidCursor()
  }
  if (
    !Array.isArray(values) ||
    values[0] !== resource ||
    values.length !== shape.length + 1
  )
    throw invalidCursor()
  const key = values.slice(1) as unknown[]
  if (
    key.some((value, index) =>
      shape[index] === 'number'
        ? typeof value !== 'number' || !Number.isSafeInteger(value)
        : typeof value !== 'string' &&
          !(shape[index] === 'title' && value === null),
    )
  )
    throw invalidCursor()
  return key as CursorValue[]
}

interface ListPlan<T, Row> {
  cursor: CursorSlot[]
  sql(after: boolean): string
  binds(churchId: string, now: number): CursorValue[]
  after(values: CursorValue[]): CursorValue[]
  key(row: Row): CursorValue[]
  /** A shorter key for when `key` does not fit in a cursor. */
  compactKey?(row: Row): CursorValue[]
  /** Restores the full key from a compact one. */
  resolve?(
    db: D1Database,
    churchId: string,
    values: CursorValue[],
  ): Promise<CursorValue[]>
  map(row: Row, origin: string): T
}

interface EventRow {
  id: string
  slug: string
  title: string
  summary: string
  starts_at: number
  ends_at: number | null
  timezone: string
  location: string
  registration_url: string | null
  featured: number
}

interface SermonRow {
  id: string
  slug: string
  title: string
  speaker: string
  series: string | null
  summary: string
  preached_at: number
  video_url: string | null
  featured: number
  audio_id: string | null
  audio_type: string | null
}

interface GroupRow {
  id: string
  slug: string
  title: string
  group_type: string
  audience: string
  schedule: string
  location: string | null
  enrollment_policy: GroupItem['enrollment']
  featured: number
  summary: string
}

interface CourseRow {
  id: string
  slug: string
  title: string
  course_type: string
  delivery_mode: string
  audience: string
  duration: string
  featured: number
  certificate_offered: number
  summary: string
  lesson_count: number
}

const safeHttp = (value: string | null) => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null
  } catch {
    return null
  }
}

// Featured-first title order: featured DESC, title ASC, id ASC.
const featuredAfter = (alias: string) =>
  `AND (${alias}featured < ? OR (${alias}featured = ? AND (${alias}title > ? OR (${alias}title = ? AND ${alias}id > ?))))`
const featuredBinds = ([featured, title, id]: CursorValue[]) =>
  [featured, featured, title, title, id] as CursorValue[]
const featuredKey = (row: { featured: number; title: string; id: string }) => [
  row.featured,
  row.title,
  row.id,
]
// A title of up to 160 characters fits in a cursor unless JSON must escape
// most of it. One that does not fit is looked up by id on the next request,
// so only renaming that one record mid-read can move the reader's position.
// The lookup sees only published records, so a forged id cannot place a page
// next to a draft's or deleted record's title; unpublishing the anchor
// mid-read makes the cursor stale instead.
const featuredCompactKey = (row: { featured: number; id: string }) => [
  row.featured,
  null,
  row.id,
]
const resolveFeaturedTitle =
  (table: 'groups' | 'courses') =>
  async (db: D1Database, churchId: string, values: CursorValue[]) => {
    const [featured, title, id] = values
    if (title !== null) return values
    const anchor = await db
      .prepare(
        `SELECT title FROM ${table}
         WHERE church_id = ? AND id = ? AND status = 'published'
           AND deleted_at IS NULL`,
      )
      .bind(churchId, id)
      .first<{ title: string }>()
    if (!anchor) throw invalidCursor()
    return [featured, anchor.title, id] as CursorValue[]
  }

const plans: {
  [K in ListResource]: ListPlan<ListResources[K], never>
} = {
  events: {
    cursor: ['number', 'string'],
    sql: (after) => `
      SELECT id, slug, title, summary, starts_at, ends_at, timezone, location,
        registration_url, featured
      FROM events
      WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL
        AND COALESCE(ends_at, starts_at) >= ?
        ${after ? 'AND (starts_at > ? OR (starts_at = ? AND id > ?))' : ''}
      ORDER BY starts_at, id
      LIMIT ?
    `,
    binds: (churchId, now) => [churchId, now],
    after: ([startsAt, id]) => [startsAt, startsAt, id] as CursorValue[],
    key: (row: EventRow) => [row.starts_at, row.id],
    map: (row: EventRow): EventItem => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      startsAt: new Date(row.starts_at).toISOString(),
      endsAt: row.ends_at === null ? null : new Date(row.ends_at).toISOString(),
      timezone: row.timezone,
      location: row.location,
      registrationUrl: safeHttp(row.registration_url),
      featured: row.featured === 1,
    }),
  } as ListPlan<EventItem, never>,
  sermons: {
    cursor: ['number', 'string'],
    sql: (after) => `
      SELECT s.id, s.slug, s.title, s.speaker, s.series, s.summary,
        s.preached_at, s.video_url, s.featured,
        m.id AS audio_id, m.content_type AS audio_type
      FROM sermons s
      LEFT JOIN media m ON m.church_id = s.church_id AND m.id = s.audio_media_id
        AND m.visibility = 'public' AND m.deleted_at IS NULL
      WHERE s.church_id = ? AND s.status = 'published' AND s.deleted_at IS NULL
        ${after ? 'AND (s.preached_at < ? OR (s.preached_at = ? AND s.id < ?))' : ''}
      ORDER BY s.preached_at DESC, s.id DESC
      LIMIT ?
    `,
    binds: (churchId) => [churchId],
    after: ([preachedAt, id]) => [preachedAt, preachedAt, id] as CursorValue[],
    key: (row: SermonRow) => [row.preached_at, row.id],
    map: (row: SermonRow, origin): SermonItem => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      speaker: row.speaker,
      series: emptyToNull(row.series),
      summary: row.summary,
      // Sermon dates are stored at noon UTC of the preached calendar date.
      preachedOn: new Date(row.preached_at).toISOString().slice(0, 10),
      videoUrl: safeHttp(row.video_url),
      audio:
        row.audio_id && row.audio_type
          ? { url: mediaUrl(origin, row.audio_id), contentType: row.audio_type }
          : null,
      featured: row.featured === 1,
    }),
  } as ListPlan<SermonItem, never>,
  groups: {
    cursor: ['number', 'title', 'string'],
    sql: (after) => `
      SELECT id, slug, title, group_type, audience, schedule, location,
        enrollment_policy, featured, summary
      FROM groups
      WHERE church_id = ? AND status = 'published' AND deleted_at IS NULL
        ${after ? featuredAfter('') : ''}
      ORDER BY featured DESC, title, id
      LIMIT ?
    `,
    binds: (churchId) => [churchId],
    after: featuredBinds,
    key: featuredKey,
    compactKey: featuredCompactKey,
    resolve: resolveFeaturedTitle('groups'),
    map: (row: GroupRow): GroupItem => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      groupType: row.group_type,
      audience: row.audience,
      schedule: row.schedule,
      location: emptyToNull(row.location),
      enrollment: row.enrollment_policy,
      featured: row.featured === 1,
      summary: row.summary,
    }),
  } as ListPlan<GroupItem, never>,
  courses: {
    cursor: ['number', 'title', 'string'],
    sql: (after) => `
      SELECT c.id, c.slug, c.title, c.course_type, c.delivery_mode, c.audience,
        c.duration, c.featured, c.certificate_offered, c.summary,
        (SELECT COUNT(*) FROM lessons l
          WHERE l.church_id = c.church_id AND l.course_id = c.id) AS lesson_count
      FROM courses c
      WHERE c.church_id = ? AND c.status = 'published' AND c.deleted_at IS NULL
        ${after ? featuredAfter('c.') : ''}
      ORDER BY c.featured DESC, c.title, c.id
      LIMIT ?
    `,
    binds: (churchId) => [churchId],
    after: featuredBinds,
    key: featuredKey,
    compactKey: featuredCompactKey,
    resolve: resolveFeaturedTitle('courses'),
    map: (row: CourseRow, origin): CourseItem => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      courseType: row.course_type,
      deliveryMode: row.delivery_mode,
      audience: row.audience,
      duration: row.duration,
      featured: row.featured === 1,
      certificateOffered: row.certificate_offered === 1,
      summary: row.summary,
      lessonCount: row.lesson_count,
      url: `${origin}/courses/${encodeURIComponent(row.slug)}`,
    }),
  } as ListPlan<CourseItem, never>,
}

export async function readWebsiteList<K extends ListResource>(
  db: D1Database,
  resource: K,
  input: {
    churchId: string
    origin: string
    cursor: string | null
    limit: number
    now: number
  },
): Promise<{ items: ListResources[K][]; nextCursor: string | null }> {
  const plan = plans[resource] as unknown as ListPlan<
    ListResources[K],
    Record<string, unknown>
  >
  let after = input.cursor
    ? decodeCursor(input.cursor, resource, plan.cursor)
    : null
  if (after && plan.resolve)
    after = await plan.resolve(db, input.churchId, after)
  const binds = [
    ...plan.binds(input.churchId, input.now),
    ...(after ? plan.after(after) : []),
    input.limit + 1,
  ]
  const { results } = await db
    .prepare(plan.sql(after !== null))
    .bind(...binds)
    .all<Record<string, unknown>>()
  const page = results.slice(0, input.limit)
  const last = page.at(-1)
  return {
    items: page.map((row) => plan.map(row, input.origin)),
    nextCursor:
      results.length > input.limit && last
        ? nextCursor(resource, plan, last)
        : null,
  }
}

function nextCursor<Row>(
  resource: ListResource,
  plan: ListPlan<unknown, Row>,
  last: Row,
) {
  const cursor =
    encodeCursor(resource, plan.key(last)) ??
    (plan.compactKey ? encodeCursor(resource, plan.compactKey(last)) : null)
  if (cursor === null)
    throw new Error(`The ${resource} page cursor is too long`)
  return cursor
}
