import { getPluginSetting } from 'emdash'
import type {
  ChurchResponse,
  ListResource,
  ListResources,
  PageResponse,
  SourceResult,
} from '@fellowship42/website-contract'
import { loadConnection } from '../environment'
import { PLUGIN_ID, sourceFor } from '../shared/connection'
import { contractTransport } from '../transport'

export { VISITOR_MESSAGES, cursorParam, headingId } from './present'

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

/**
 * The request's church source. Plugin settings are read only when the
 * deployment does not pin the address, and a failed read becomes the
 * unavailable state instead of a failed render.
 */
function source(request: Request) {
  return memo(request, 'source', async () => {
    const config = await loadConnection((key) =>
      getPluginSetting(PLUGIN_ID, key),
    )
    return sourceFor(config, contractTransport(config))
  })
}

function logFailure(result: SourceResult<unknown>, resource: string) {
  if (!result.ok && result.state !== 'unpublished')
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'fellowship42.source_unavailable',
        state: result.state,
        resource,
        reason: result.message,
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
