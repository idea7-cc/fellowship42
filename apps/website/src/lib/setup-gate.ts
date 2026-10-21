import {
  isUsableSetupSecret,
  verifySetupClaim,
} from '@fellowship42/website-contract'
import type { WebsiteEnv } from './env'

/**
 * EmDash lets the first visitor create its first administrator. A Fellowship42
 * installation closes that window: setup requests need a claim that the
 * church's Fellowship42 instance issues to an owner. The claim travels in a
 * short-lived, HttpOnly cookie scoped to EmDash's own paths.
 */

export const SETUP_COOKIE = 'f42_website_setup'
export const SETUP_PAGE = '/fellowship42/setup'

export type GateEnv = Pick<
  WebsiteEnv,
  'WEBSITE_SETUP_SECRET' | 'EMDASH_SITE_URL'
>

/**
 * The path Astro routes on: percent-decoded (as `decodeURI` does, repeatedly),
 * repeated slashes collapsed, and trailing slashes removed. Matching on this
 * form means an encoded or padded path cannot reach a gated route unseen.
 */
export function routePath(pathname: string) {
  let path = pathname
  for (let depth = 0; depth < 10; depth++) {
    let decoded: string
    try {
      decoded = decodeURI(path)
    } catch {
      break
    }
    if (decoded === path) break
    path = decoded
  }
  return path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
}

/** EmDash routes that create the first administrator or reset setup. */
export function isGatedSetupPath(pathname: string, method: string) {
  const path = routePath(pathname)
  if (path === '/_emdash/api/setup/status') return false
  if (path === '/_emdash/admin/setup') return method === 'GET'
  return path === '/_emdash/api/setup' || path.startsWith('/_emdash/api/setup/')
}

/**
 * EmDash's OAuth start route, `/_emdash/api/auth/oauth/<provider>`. While
 * setup is incomplete, EmDash's OAuth callback makes whoever signs in its
 * first administrator, so a configured provider would bypass the owner
 * claim. Refusing the start route is enough: the callback only accepts a
 * state that the start route issued. The callback itself is never gated,
 * because the claim cookie is SameSite=Strict and is not sent on the
 * provider's cross-site redirect back.
 */
export function isOAuthStartPath(pathname: string) {
  return /^\/_emdash\/api\/auth\/oauth\/[^/]+$/.test(routePath(pathname))
}

/**
 * Setup counts as open while the installation holds a setup secret at all,
 * usable or not. The secret is removed once the first administrator exists.
 */
export function isSetupWindowOpen(env: GateEnv) {
  return Boolean(env.WEBSITE_SETUP_SECRET?.trim())
}

export function readCookie(header: string | null, name: string) {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return null
}

/** The origin claims must name: the configured site URL, else the request's. */
export function siteOrigin(env: GateEnv, requestUrl: URL) {
  try {
    if (env.EMDASH_SITE_URL?.trim())
      return new URL(env.EMDASH_SITE_URL.trim()).origin
  } catch {
    // An invalid configured URL never widens access.
    return null
  }
  return requestUrl.origin
}

export async function hasSetupClaim(
  env: GateEnv,
  request: Request,
  now = Date.now(),
) {
  if (!isUsableSetupSecret(env.WEBSITE_SETUP_SECRET)) return false
  const origin = siteOrigin(env, new URL(request.url))
  if (!origin) return false
  const claim = await verifySetupClaim(
    env.WEBSITE_SETUP_SECRET,
    readCookie(request.headers.get('cookie'), SETUP_COOKIE),
    { audience: origin, now },
  )
  return claim !== null
}

export function setupCookie(
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
) {
  return `${SETUP_COOKIE}=${value}; Path=/_emdash; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure ? '; Secure' : ''}`
}
