import { defineMiddleware } from 'astro:middleware'

// The caching recipe from the @fellowship42/emdash README, as a site
// developer copies it.
// Church blocks render live Fellowship42 data; never serve a stored copy.
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next()
  const isHtml = response.headers
    .get('Content-Type')
    ?.toLowerCase()
    .startsWith('text/html')
  if (!isHtml || context.url.pathname.startsWith('/_emdash')) return response
  if (context.cache.enabled) context.cache.set(false)
  if (response.headers.has('Cache-Control')) return response
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-cache')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
})
