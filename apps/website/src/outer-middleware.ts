import { defineMiddleware } from 'astro:middleware'
import {
  SETUP_PAGE,
  hasSetupClaim,
  isGatedSetupPath,
  type GateEnv,
} from './lib/setup-gate'

const env = () =>
  ((globalThis as { process?: { env?: GateEnv } }).process?.env ??
    {}) as GateEnv

/**
 * Wraps the complete EmDash pipeline. Before EmDash runs, it refuses
 * first-administrator setup without a Fellowship42 owner claim. After, it
 * keeps public pages from being cached so Fellowship42 withdrawals show on
 * the next visit.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context
  if (
    isGatedSetupPath(url.pathname, request.method) &&
    !(await hasSetupClaim(env(), request))
  ) {
    if (request.method === 'GET' && url.pathname.startsWith('/_emdash/admin'))
      return Response.redirect(new URL(SETUP_PAGE, url), 303)
    return Response.json(
      {
        error: {
          code: 'FELLOWSHIP42_SETUP_CLAIM_REQUIRED',
          message:
            'Open website setup from Fellowship42 (Settings → Website) as a church owner.',
        },
      },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const response = await next()
  const headers = new Headers(response.headers)
  const isHtml = headers
    .get('Content-Type')
    ?.toLowerCase()
    .startsWith('text/html')
  if (
    isHtml &&
    !url.pathname.startsWith('/_emdash') &&
    !headers.has('Cache-Control')
  ) {
    // Church blocks render live Fellowship42 data; never serve a stored copy.
    headers.set('Cache-Control', 'no-cache')
  }
  if (!headers.has('Referrer-Policy'))
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (!headers.has('X-Content-Type-Options'))
    headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
})
