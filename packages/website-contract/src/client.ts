import {
  MAX_PAGE_LIMIT,
  WEBSITE_CONTRACT_PATH,
  type ChurchResponse,
  type ContractEnvelope,
  type ListResource,
  type ListResources,
  type PageResponse,
  type WebsiteDescriptor,
} from './contract.js'
import {
  ContractShapeError,
  ContractVersionError,
  parseChurch,
  parseDescriptor,
  parseEnvelope,
  parseErrorCode,
  parsePage,
} from './parse.js'

/**
 * Why a source could not supply content. Each state is a deliberate website
 * state: consumers render an explanation, never stale or guessed content.
 */
export type SourceState =
  | 'not-configured'
  | 'unavailable'
  | 'incompatible'
  | 'unpublished'
  | 'wrong-instance'
  | 'invalid-request'

export type SourceResult<T> =
  { ok: true; data: T } | { ok: false; state: SourceState; message: string }

/** The subset of a fetch Response the client reads. */
export interface ContractFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

/**
 * Injected transport: global `fetch`, a Cloudflare service binding's `fetch`,
 * or an EmDash sandbox's `ctx.http.fetch`. It receives an absolute URL.
 */
export type ContractFetch = (
  url: string,
  init: {
    method: 'GET'
    headers: Record<string, string>
    redirect: 'manual'
    signal?: AbortSignal
  },
) => Promise<ContractFetchResponse>

export interface ChurchSourceOptions {
  /** Origin of the Fellowship42 instance, e.g. `https://app.example.org`. */
  url: string | null | undefined
  /** Expected SHA-256 hex of the instance's portable identity, if pinned. */
  expectedInstanceSha256?: string | null
  fetch: ContractFetch
  /** Per-request timeout; defaults to 5 seconds. */
  timeoutMs?: number
}

export interface ListQuery {
  cursor?: string | null
  limit?: number
}

export interface ChurchSource {
  /** Normalized instance origin, or null when unconfigured or invalid. */
  readonly origin: string | null
  describe(): Promise<SourceResult<WebsiteDescriptor>>
  church(): Promise<SourceResult<ChurchResponse>>
  list<K extends ListResource>(
    resource: K,
    query?: ListQuery,
  ): Promise<SourceResult<PageResponse<ListResources[K]>>>
}

export const SOURCE_MESSAGES: Record<SourceState, string> = {
  'not-configured': 'This website is not connected to Fellowship42 yet.',
  unavailable:
    'Fellowship42 did not respond. Church information is temporarily unavailable.',
  incompatible:
    'The connected address does not serve a compatible Fellowship42 website contract (version 1).',
  unpublished: 'The church has not published its Fellowship42 information yet.',
  'wrong-instance':
    'The connected address belongs to a different Fellowship42 church than this website expects.',
  'invalid-request': 'That page of church information could not be found.',
}

const SHA256 = /^[0-9a-f]{64}$/

/** Returns the http(s) origin of a configured instance URL, or null. */
export function normalizeInstanceOrigin(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

function failure<T>(state: SourceState): SourceResult<T> {
  return { ok: false, state, message: SOURCE_MESSAGES[state] }
}

/** Matches by name so a SyntaxError from another realm still counts. */
function isSyntaxError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'SyntaxError'
  )
}

export function createChurchSource(options: ChurchSourceOptions): ChurchSource {
  const origin = normalizeInstanceOrigin(options.url)
  const expected = options.expectedInstanceSha256?.trim().toLowerCase() || null
  const timeoutMs = options.timeoutMs ?? 5_000

  async function request<T extends ContractEnvelope>(
    path: string,
    parse: (value: unknown) => T,
  ): Promise<SourceResult<T>> {
    if (!origin) return failure('not-configured')
    if (expected && !SHA256.test(expected)) return failure('not-configured')
    let response: ContractFetchResponse
    try {
      response = await options.fetch(
        `${origin}${WEBSITE_CONTRACT_PATH}${path}`,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
          redirect: 'manual',
          signal:
            typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
              ? AbortSignal.timeout(timeoutMs)
              : undefined,
        },
      )
    } catch {
      return failure('unavailable')
    }
    const transient = response.status >= 500 || response.status === 429
    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      // Only a body that arrived and is not JSON says anything about the
      // server; a timeout, abort, or reset while reading it is transient.
      return failure(
        transient || !isSyntaxError(error) ? 'unavailable' : 'incompatible',
      )
    }
    if (!response.ok) {
      const code = parseErrorCode(body)
      if (transient) return failure('unavailable')
      if (code === null) return failure('incompatible')
      try {
        const envelope = parseEnvelope(body)
        if (expected && envelope.instance.portableIdentitySha256 !== expected)
          return failure('wrong-instance')
      } catch {
        return failure('incompatible')
      }
      if (code === 'site_unpublished') return failure('unpublished')
      if (code === 'invalid_cursor' || code === 'invalid_limit')
        return failure('invalid-request')
      // A contract error this client does not know, such as route_not_found
      // from an instance that lacks a route, means the versions disagree.
      return failure('incompatible')
    }
    try {
      const data = parse(body)
      if (expected && data.instance.portableIdentitySha256 !== expected)
        return failure('wrong-instance')
      return { ok: true, data }
    } catch (error) {
      if (
        error instanceof ContractVersionError ||
        error instanceof ContractShapeError
      )
        return failure('incompatible')
      throw error
    }
  }

  return {
    origin,
    describe: () => request('', parseDescriptor),
    church: () => request('/church', parseChurch),
    list(resource, query = {}) {
      const params = new URLSearchParams()
      const limit = Math.min(
        MAX_PAGE_LIMIT,
        Math.max(1, Math.trunc(query.limit ?? 20)),
      )
      params.set('limit', String(limit))
      if (query.cursor) params.set('cursor', query.cursor)
      return request(`/${resource}?${params}`, (value) =>
        parsePage(resource, value),
      )
    },
  }
}
