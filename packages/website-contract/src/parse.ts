import {
  MAX_CURSOR_LENGTH,
  WEBSITE_CONTRACT,
  WEBSITE_CONTRACT_VERSION,
  type ChurchProfile,
  type ChurchResponse,
  type ContractEnvelope,
  type ContractImage,
  type CourseItem,
  type EventItem,
  type GroupItem,
  type ListResource,
  type ListResources,
  type PageResponse,
  type SermonItem,
  type ServiceTime,
  type WebsiteDescriptor,
} from './contract.js'

/** A response that is not a valid contract document. */
export class ContractShapeError extends Error {
  constructor(readonly path: string) {
    super(`Invalid website contract document at ${path}`)
    this.name = 'ContractShapeError'
  }
}

/** A document for another contract or an unsupported major version. */
export class ContractVersionError extends Error {
  constructor(
    readonly contract: unknown,
    readonly version: unknown,
  ) {
    super(
      `Expected ${WEBSITE_CONTRACT} version ${WEBSITE_CONTRACT_VERSION}, received ${String(contract)} version ${String(version)}`,
    )
    this.name = 'ContractVersionError'
  }
}

type Json = Record<string, unknown>

const SHA256 = /^[0-9a-f]{64}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function object(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ContractShapeError(path)
  return value as Json
}

function string(value: unknown, path: string, max = 20_000): string {
  if (typeof value !== 'string' || value.length > max)
    throw new ContractShapeError(path)
  return value
}

function nullableString(value: unknown, path: string, max?: number) {
  return value === null || value === undefined ? null : string(value, path, max)
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ContractShapeError(path)
  return value
}

function integer(value: unknown, path: string, min: number, max: number) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new ContractShapeError(path)
  return value
}

/** Absolute http(s) URL; anything else is rejected rather than rendered. */
function httpUrl(value: unknown, path: string): string {
  const text = string(value, path, 4_096)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new ContractShapeError(path)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new ContractShapeError(path)
  return url.href
}

function nullableHttpUrl(value: unknown, path: string) {
  return value === null || value === undefined ? null : httpUrl(value, path)
}

function instant(value: unknown, path: string): string {
  const text = string(value, path, 64)
  const time = Date.parse(text)
  if (!Number.isFinite(time) || !text.endsWith('Z'))
    throw new ContractShapeError(path)
  return new Date(time).toISOString()
}

function timeZone(value: unknown, path: string): string {
  const zone = string(value, path, 64)
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    throw new ContractShapeError(path)
  }
  return zone
}

function calendarDate(value: unknown, path: string): string {
  const text = string(value, path, 10)
  if (!DATE.test(text)) throw new ContractShapeError(path)
  const [year, month, day] = text.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new ContractShapeError(path)
  return text
}

function list<T>(
  value: unknown,
  path: string,
  item: (value: unknown, path: string) => T,
  max: number,
): T[] {
  if (!Array.isArray(value) || value.length > max)
    throw new ContractShapeError(path)
  return value.map((entry, index) => item(entry, `${path}[${index}]`))
}

/**
 * Checks the contract name and major version, then the envelope. A version
 * mismatch is reported separately from a malformed document so a consumer
 * can explain that an update is needed.
 */
export function parseEnvelope(value: unknown): ContractEnvelope {
  const root = object(value, '$')
  if (
    root.contract !== WEBSITE_CONTRACT ||
    root.version !== WEBSITE_CONTRACT_VERSION
  )
    throw new ContractVersionError(root.contract, root.version)
  const instance = object(root.instance, '$.instance')
  const digest = string(
    instance.portableIdentitySha256,
    '$.instance.portableIdentitySha256',
    64,
  )
  if (!SHA256.test(digest))
    throw new ContractShapeError('$.instance.portableIdentitySha256')
  return {
    contract: WEBSITE_CONTRACT,
    version: WEBSITE_CONTRACT_VERSION,
    instance: { portableIdentitySha256: digest },
  }
}

export function parseDescriptor(value: unknown): WebsiteDescriptor {
  const envelope = parseEnvelope(value)
  const root = object(value, '$')
  const site = object(root.site, '$.site')
  if (site.status !== 'published' && site.status !== 'unpublished')
    throw new ContractShapeError('$.site.status')
  const church =
    root.church === null || root.church === undefined
      ? null
      : (() => {
          const raw = object(root.church, '$.church')
          return {
            name: string(raw.name, '$.church.name', 200),
            slug: string(raw.slug, '$.church.slug', 200),
          }
        })()
  return {
    ...envelope,
    site: { status: site.status },
    church: site.status === 'published' ? church : null,
    origin: httpUrl(root.origin, '$.origin').replace(/\/$/, ''),
  }
}

function image(value: unknown, path: string): ContractImage | null {
  if (value === null || value === undefined) return null
  const raw = object(value, path)
  return {
    url: httpUrl(raw.url, `${path}.url`),
    alt: string(raw.alt ?? '', `${path}.alt`, 1_000),
  }
}

function serviceTime(value: unknown, path: string): ServiceTime {
  const raw = object(value, path)
  const time = string(raw.time, `${path}.time`, 5)
  if (!HHMM.test(time)) throw new ContractShapeError(`${path}.time`)
  return {
    label: string(raw.label, `${path}.label`, 200),
    day: integer(raw.day, `${path}.day`, 0, 6),
    time,
  }
}

export function parseChurch(value: unknown): ChurchResponse {
  const envelope = parseEnvelope(value)
  const raw = object(object(value, '$').church, '$.church')
  const address = object(raw.address, '$.church.address')
  const contact = object(raw.contact, '$.church.contact')
  const links = object(raw.links, '$.church.links')
  const theme = object(raw.theme, '$.church.theme')
  const church: ChurchProfile = {
    name: string(raw.name, '$.church.name', 200),
    slug: string(raw.slug, '$.church.slug', 200),
    tagline: string(raw.tagline, '$.church.tagline', 500),
    summary: string(raw.summary, '$.church.summary'),
    timezone: timeZone(raw.timezone, '$.church.timezone'),
    address: {
      street: string(address.street, '$.church.address.street', 500),
      city: string(address.city, '$.church.address.city', 200),
      region: string(address.region, '$.church.address.region', 200),
      postalCode: string(address.postalCode, '$.church.address.postalCode', 40),
      countryCode: string(
        address.countryCode,
        '$.church.address.countryCode',
        8,
      ),
    },
    contact: {
      phone: nullableString(contact.phone, '$.church.contact.phone', 80),
      email: nullableString(contact.email, '$.church.contact.email', 320),
      website: nullableHttpUrl(contact.website, '$.church.contact.website'),
    },
    links: {
      giving: nullableHttpUrl(links.giving, '$.church.links.giving'),
      livestream: nullableHttpUrl(
        links.livestream,
        '$.church.links.livestream',
      ),
    },
    logo: image(raw.logo, '$.church.logo'),
    cover: image(raw.cover, '$.church.cover'),
    theme: { preset: string(theme.preset, '$.church.theme.preset', 40) },
    serviceTimes: list(
      raw.serviceTimes,
      '$.church.serviceTimes',
      serviceTime,
      50,
    ),
  }
  return { ...envelope, church }
}

function eventItem(value: unknown, path: string): EventItem {
  const raw = object(value, path)
  return {
    id: string(raw.id, `${path}.id`, 200),
    slug: string(raw.slug, `${path}.slug`, 200),
    title: string(raw.title, `${path}.title`, 500),
    summary: string(raw.summary, `${path}.summary`),
    startsAt: instant(raw.startsAt, `${path}.startsAt`),
    endsAt:
      raw.endsAt === null || raw.endsAt === undefined
        ? null
        : instant(raw.endsAt, `${path}.endsAt`),
    timezone: timeZone(raw.timezone, `${path}.timezone`),
    location: string(raw.location, `${path}.location`, 500),
    registrationUrl: nullableHttpUrl(
      raw.registrationUrl,
      `${path}.registrationUrl`,
    ),
    featured: boolean(raw.featured, `${path}.featured`),
  }
}

function sermonItem(value: unknown, path: string): SermonItem {
  const raw = object(value, path)
  const audio =
    raw.audio === null || raw.audio === undefined
      ? null
      : (() => {
          const media = object(raw.audio, `${path}.audio`)
          return {
            url: httpUrl(media.url, `${path}.audio.url`),
            contentType: string(
              media.contentType,
              `${path}.audio.contentType`,
              200,
            ),
          }
        })()
  return {
    id: string(raw.id, `${path}.id`, 200),
    slug: string(raw.slug, `${path}.slug`, 200),
    title: string(raw.title, `${path}.title`, 500),
    speaker: string(raw.speaker, `${path}.speaker`, 200),
    series: nullableString(raw.series, `${path}.series`, 200),
    summary: string(raw.summary, `${path}.summary`),
    preachedOn: calendarDate(raw.preachedOn, `${path}.preachedOn`),
    videoUrl: nullableHttpUrl(raw.videoUrl, `${path}.videoUrl`),
    audio,
    featured: boolean(raw.featured, `${path}.featured`),
  }
}

function groupItem(value: unknown, path: string): GroupItem {
  const raw = object(value, path)
  if (
    raw.enrollment !== 'closed' &&
    raw.enrollment !== 'request' &&
    raw.enrollment !== 'open'
  )
    throw new ContractShapeError(`${path}.enrollment`)
  return {
    id: string(raw.id, `${path}.id`, 200),
    slug: string(raw.slug, `${path}.slug`, 200),
    title: string(raw.title, `${path}.title`, 500),
    groupType: string(raw.groupType, `${path}.groupType`, 100),
    audience: string(raw.audience, `${path}.audience`, 200),
    schedule: string(raw.schedule, `${path}.schedule`, 500),
    location: nullableString(raw.location, `${path}.location`, 500),
    enrollment: raw.enrollment,
    featured: boolean(raw.featured, `${path}.featured`),
    summary: string(raw.summary, `${path}.summary`),
  }
}

function courseItem(value: unknown, path: string): CourseItem {
  const raw = object(value, path)
  return {
    id: string(raw.id, `${path}.id`, 200),
    slug: string(raw.slug, `${path}.slug`, 200),
    title: string(raw.title, `${path}.title`, 500),
    courseType: string(raw.courseType, `${path}.courseType`, 100),
    deliveryMode: string(raw.deliveryMode, `${path}.deliveryMode`, 100),
    audience: string(raw.audience, `${path}.audience`, 200),
    duration: string(raw.duration, `${path}.duration`, 200),
    featured: boolean(raw.featured, `${path}.featured`),
    certificateOffered: boolean(
      raw.certificateOffered,
      `${path}.certificateOffered`,
    ),
    summary: string(raw.summary, `${path}.summary`),
    lessonCount: integer(raw.lessonCount, `${path}.lessonCount`, 0, 1_000_000),
    url: httpUrl(raw.url, `${path}.url`),
  }
}

const itemParsers: {
  [K in ListResource]: (value: unknown, path: string) => ListResources[K]
} = {
  events: eventItem,
  sermons: sermonItem,
  groups: groupItem,
  courses: courseItem,
}

export function parsePage<K extends ListResource>(
  resource: K,
  value: unknown,
): PageResponse<ListResources[K]> {
  const envelope = parseEnvelope(value)
  const root = object(value, '$')
  const nextCursor =
    root.nextCursor === null || root.nextCursor === undefined
      ? null
      : string(root.nextCursor, '$.nextCursor', MAX_CURSOR_LENGTH)
  return {
    ...envelope,
    items: list(
      root.items,
      '$.items',
      itemParsers[resource] as (
        value: unknown,
        path: string,
      ) => ListResources[K],
      1_000,
    ),
    nextCursor,
  }
}

/** Reads a contract error body when present; returns null otherwise. */
export function parseErrorCode(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const error = (value as Json).error
  if (typeof error !== 'object' || error === null) return null
  const code = (error as Json).code
  return typeof code === 'string' ? code : null
}
