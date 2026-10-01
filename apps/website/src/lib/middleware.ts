import {
  SETUP_PAGE,
  hasSetupClaim,
  isGatedSetupPath,
  isOAuthStartPath,
  isSetupWindowOpen,
  routePath,
  type GateEnv,
} from './setup-gate'

/** The parts of Astro's middleware context the website policy reads. */
export interface PolicyContext {
  request: Request
  url: URL
}

function refuse(code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/**
 * Headers every response leaves with. HTML outside EmDash's own routes gets
 * `no-cache` unless a page chose otherwise: church blocks render live
 * Fellowship42 data, so a stored copy would outlive a withdrawal.
 */
export function withPublicHeaders(response: Response, pathname: string) {
  const headers = new Headers(response.headers)
  const isHtml = headers
    .get('Content-Type')
    ?.toLowerCase()
    .startsWith('text/html')
  if (
    isHtml &&
    !pathname.startsWith('/_emdash') &&
    !headers.has('Cache-Control')
  )
    headers.set('Cache-Control', 'no-cache')
  if (!headers.has('Referrer-Policy'))
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (!headers.has('X-Content-Type-Options'))
    headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * The website's outer request policy, wrapping the complete EmDash pipeline.
 * Before EmDash runs, it refuses first-administrator setup without a
 * Fellowship42 owner claim, and OAuth sign-in while setup is open. After,
 * it applies the public cache and security headers.
 */
export function createOuterMiddleware(readEnv: () => GateEnv) {
  return async (
    { request, url }: PolicyContext,
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const env = readEnv()
    if (isOAuthStartPath(url.pathname) && isSetupWindowOpen(env))
      return refuse(
        'FELLOWSHIP42_OAUTH_CLOSED_DURING_SETUP',
        'Sign-in with an external provider is turned off until website setup is complete and WEBSITE_SETUP_SECRET is removed.',
      )
    if (
      isGatedSetupPath(url.pathname, request.method) &&
      !(await hasSetupClaim(env, request))
    ) {
      if (
        request.method === 'GET' &&
        routePath(url.pathname).startsWith('/_emdash/admin')
      )
        return Response.redirect(new URL(SETUP_PAGE, url), 303)
      return refuse(
        'FELLOWSHIP42_SETUP_CLAIM_REQUIRED',
        'Open website setup from Fellowship42 (Settings → Website) as a church owner.',
      )
    }
    return withPublicHeaders(await next(), url.pathname)
  }
}
