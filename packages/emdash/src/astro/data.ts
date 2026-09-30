import { getPluginSetting } from 'emdash'
import type {
  ChurchResponse,
  ListResource,
  ListResources,
  PageResponse,
  SourceResult,
  SourceState,
} from '@fellowship42/website-contract'
import {
  CONNECTION_SETTINGS,
  PLUGIN_ID,
  processEnv,
  resolveConnectionConfig,
  sourceFor,
} from '../shared/connection'
import { nativeFetch } from '../transport'

/**
 * Reads church content while a page renders. Results are shared by the blocks
 * of one request and never outlive it, so a withdrawal in Fellowship42 is
 * visible on the next page load.
 */

const perRequest = new WeakMap<Request, Map<string, Promise<unknown>>>()

function memo<T>(request: Request, key: string, load: () => Promise<T>) {
  let entries = perRequest.get(request)
  if (!entries) {
    entries = new Map()
    perRequest.set(request, entries)
  }
  if (!entries.has(key)) entries.set(key, load())
  return entries.get(key) as Promise<T>
}

function source(request: Request) {
  return memo(request, 'source', async () =>
    sourceFor(
      resolveConnectionConfig(processEnv(), {
        [CONNECTION_SETTINGS.url]: await getPluginSetting(
          PLUGIN_ID,
          CONNECTION_SETTINGS.url,
        ),
        [CONNECTION_SETTINGS.instance]: await getPluginSetting(
          PLUGIN_ID,
          CONNECTION_SETTINGS.instance,
        ),
      }),
      nativeFetch,
    ),
  )
}

function logFailure(result: SourceResult<unknown>, resource: string) {
  if (!result.ok && result.state !== 'unpublished')
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'fellowship42.source_unavailable',
        state: result.state,
        resource,
      }),
    )
  return result
}

export function loadChurch(
  request: Request,
): Promise<SourceResult<ChurchResponse>> {
  return memo(request, 'church', async () =>
    logFailure(await (await source(request)).church(), 'church'),
  ) as Promise<SourceResult<ChurchResponse>>
}

export function loadList<K extends ListResource>(
  request: Request,
  resource: K,
  query: { cursor: string | null; limit: number },
): Promise<SourceResult<PageResponse<ListResources[K]>>> {
  return memo(
    request,
    `${resource}:${query.limit}:${query.cursor ?? ''}`,
    async () =>
      logFailure(await (await source(request)).list(resource, query), resource),
  ) as Promise<SourceResult<PageResponse<ListResources[K]>>>
}

/** Words for visitors; operator detail goes to the log and the admin page. */
export const VISITOR_MESSAGES: Record<SourceState, string> = {
  'not-configured': 'Church information will appear here soon.',
  unavailable:
    'Church information is temporarily unavailable. Please try again shortly.',
  incompatible: 'Church information is temporarily unavailable.',
  'wrong-instance': 'Church information is temporarily unavailable.',
  unpublished: 'Church information will appear here once it is published.',
  'invalid-request':
    'That page of results is no longer available. Start again from the first page.',
}

/** Query parameter for one block's page cursor. */
export function cursorParam(type: string, key: unknown) {
  const safe =
    typeof key === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(key) ? key : type
  return `f42-${safe}`
}
