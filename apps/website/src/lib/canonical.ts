import type { WebsiteEnv } from './env'

function httpOrigin(value: string | null | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : null
  } catch {
    return null
  }
}

/**
 * The website's public origin for canonical links and structured data. It
 * follows the same order as EmDash's sitemap (site settings URL, then
 * `EMDASH_SITE_URL`, then `SITE_URL`) so both name one host. Only without any
 * of them does the request's host fill in, which would let a workers.dev or
 * preview hostname advertise itself as canonical.
 */
export function publicOrigin(
  env: Pick<WebsiteEnv, 'EMDASH_SITE_URL' | 'SITE_URL'>,
  requestUrl: URL,
  settingsUrl?: string | null,
) {
  return (
    httpOrigin(settingsUrl) ??
    httpOrigin(env.EMDASH_SITE_URL) ??
    httpOrigin(env.SITE_URL) ??
    requestUrl.origin
  )
}

/** Query parameters that select a different page of a list. */
const PAGING_PARAM = /^(?:cursor|f42-[A-Za-z0-9_-]{1,40})$/

/**
 * The canonical URL of the page at `url`, on the public origin. It keeps only
 * paging parameters (the articles cursor and church-block cursors), so every
 * page of a list is its own canonical page and tracking or preview
 * parameters are dropped.
 */
export function canonicalUrl(origin: string, url: URL) {
  const canonical = new URL(url.pathname.replace(/\/+$/, '') || '/', origin)
  const paging = [...url.searchParams]
    .filter(([name, value]) => PAGING_PARAM.test(name) && value)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [name, value] of paging) canonical.searchParams.append(name, value)
  return canonical.href
}
