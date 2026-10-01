/**
 * Fellowship42 public website contract, version 1.
 *
 * An instance serves these shapes anonymously under `WEBSITE_CONTRACT_PATH`.
 * Every response names the contract, its major version, and the portable
 * identity digest of the serving instance so a consumer can refuse an
 * incompatible or unexpected source. Fields may be added within a major
 * version; consumers must ignore fields they do not know.
 */

export const WEBSITE_CONTRACT = 'fellowship42-website' as const
export const WEBSITE_CONTRACT_VERSION = 1 as const
export const WEBSITE_CONTRACT_PATH = '/api/website/v1' as const
export const DEFAULT_PAGE_LIMIT = 20
export const MAX_PAGE_LIMIT = 100
/** Longest page cursor an instance issues or accepts. */
export const MAX_CURSOR_LENGTH = 1024

export type WebsiteContractName = typeof WEBSITE_CONTRACT
export type WebsiteContractVersion = typeof WEBSITE_CONTRACT_VERSION

/**
 * Fields present on every successful contract response and every 4xx contract
 * error. 5xx responses carry only `error` (see `ServerErrorResponse`).
 */
export interface ContractEnvelope {
  contract: WebsiteContractName
  version: WebsiteContractVersion
  instance: {
    /** SHA-256 hex digest of the instance's portable identity. */
    portableIdentitySha256: string
  }
}

export type SiteStatus = 'published' | 'unpublished'

export interface WebsiteDescriptor extends ContractEnvelope {
  site: { status: SiteStatus }
  /** Present only while the church website is published. */
  church: { name: string; slug: string } | null
  /** Absolute URL of the instance origin serving this contract. */
  origin: string
}

export interface ContractImage {
  /** Absolute URL of a public image. */
  url: string
  alt: string
}

export interface ServiceTime {
  label: string
  /** 0 = Sunday … 6 = Saturday, in the church's time zone. */
  day: number
  /** 24-hour wall-clock time, `HH:MM`, in the church's time zone. */
  time: string
}

export interface ChurchProfile {
  name: string
  slug: string
  tagline: string
  summary: string
  /** IANA time zone for service times and church-local dates. */
  timezone: string
  address: {
    street: string
    city: string
    region: string
    postalCode: string
    countryCode: string
  }
  contact: {
    phone: string | null
    email: string | null
    website: string | null
  }
  links: {
    giving: string | null
    livestream: string | null
  }
  logo: ContractImage | null
  cover: ContractImage | null
  theme: { preset: string }
  serviceTimes: ServiceTime[]
}

export interface ChurchResponse extends ContractEnvelope {
  church: ChurchProfile
}

export interface EventItem {
  id: string
  slug: string
  title: string
  summary: string
  /** ISO 8601 UTC instant. */
  startsAt: string
  /** ISO 8601 UTC instant, or null for an event without a stated end. */
  endsAt: string | null
  /** IANA time zone in which the event is held and should be displayed. */
  timezone: string
  location: string
  registrationUrl: string | null
  featured: boolean
}

export interface SermonItem {
  id: string
  slug: string
  title: string
  speaker: string
  series: string | null
  summary: string
  /** Calendar date the sermon was preached, `YYYY-MM-DD`. */
  preachedOn: string
  videoUrl: string | null
  audio: { url: string; contentType: string } | null
  featured: boolean
}

export type GroupEnrollment = 'closed' | 'request' | 'open'

export interface GroupItem {
  id: string
  slug: string
  title: string
  groupType: string
  audience: string
  schedule: string
  location: string | null
  enrollment: GroupEnrollment
  featured: boolean
  summary: string
}

export interface CourseItem {
  id: string
  slug: string
  title: string
  courseType: string
  deliveryMode: string
  audience: string
  duration: string
  featured: boolean
  certificateOffered: boolean
  summary: string
  lessonCount: number
  /** Absolute URL of the course's public page on the instance. */
  url: string
}

export interface PageResponse<T> extends ContractEnvelope {
  items: T[]
  /**
   * Opaque cursor for the next page, or null when this page is the last. It is
   * valid only on the route that issued it and is at most `MAX_CURSOR_LENGTH`
   * URL-safe characters.
   */
  nextCursor: string | null
}

export type ContractErrorCode =
  'site_unpublished' | 'invalid_cursor' | 'invalid_limit' | 'route_not_found'

/** A 4xx contract error. It carries the envelope. */
export interface ContractErrorResponse extends ContractEnvelope {
  error: { code: ContractErrorCode | string; message: string }
}

/**
 * A 5xx response, such as `503 instance_unconfigured` or `500 internal_error`.
 * It has no envelope: an instance without a valid identity has no digest to
 * report.
 */
export interface ServerErrorResponse {
  error: { code: string; message: string; requestId?: string }
}

/** List resources and the item each returns. */
export interface ListResources {
  events: EventItem
  sermons: SermonItem
  groups: GroupItem
  courses: CourseItem
}

export type ListResource = keyof ListResources

export const LIST_RESOURCES = [
  'events',
  'sermons',
  'groups',
  'courses',
] as const satisfies readonly ListResource[]
