import {
  isUsableSetupSecret,
  verifySetupClaim,
} from '@fellowship42/website-contract'

/**
 * EmDash lets the first visitor create its first administrator. A Fellowship42
 * installation closes that window: setup requests need a claim that the
 * church's Fellowship42 instance issues to an owner. The claim travels in a
 * short-lived, HttpOnly cookie scoped to EmDash's own paths.
 */

export const SETUP_COOKIE = 'f42_website_setup'
export const SETUP_PAGE = '/fellowship42/setup'

/** EmDash routes that create the first administrator or reset setup. */
export function isGatedSetupPath(pathname: string, method: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/_emdash/api/setup/status') return false
  if (path === '/_emdash/admin/setup') return method === 'GET'
  return path === '/_emdash/api/setup' || path.startsWith('/_emdash/api/setup/')
}

export function readCookie(header: string | null, name: string) {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return null
}

export interface GateEnv {
  WEBSITE_SETUP_SECRET?: string
  EMDASH_SITE_URL?: string
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
