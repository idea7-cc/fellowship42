import type { APIRoute } from 'astro'
import { verifySetupClaim } from '@fellowship42/website-contract'
import { setupCookie, siteOrigin, type GateEnv } from '../../lib/setup-gate'

export const prerender = false

const env = () =>
  ((globalThis as { process?: { env?: GateEnv } }).process?.env ??
    {}) as GateEnv

const noStore = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
}

// The claim arrives in the URL fragment, which browsers never send to a
// server or log. This page moves it into a same-origin POST once.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Set up the website editor</title>
<style>
body{font-family:system-ui,sans-serif;line-height:1.5;margin:0;padding:2rem 1.25rem;color:#1f1a16;background:#faf7f2}
main{max-width:34rem;margin:0 auto}
a{color:#2a4a7c;font-weight:600}
[role=status]{padding:1rem;border:1px solid #d9d2c8;border-radius:.75rem;background:#fff}
</style>
</head>
<body>
<main>
<h1>Set up the website editor</h1>
<p id="status" role="status" aria-live="polite">Checking your setup link…</p>
<p>Website setup opens from Fellowship42: sign in as a church owner, then go to
<strong>Settings → Website → Set up website editor</strong>. The link works for ten minutes.</p>
<p><a href="/_emdash/admin">Website editor sign-in</a></p>
</main>
<script>
(async () => {
  const status = document.getElementById('status')
  const claim = new URLSearchParams(location.hash.slice(1)).get('claim')
  history.replaceState(null, '', location.pathname)
  if (!claim) {
    status.textContent = 'Open this page from Fellowship42 to set up the website editor.'
    return
  }
  const response = await fetch(location.pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ claim }),
  }).catch(() => null)
  if (response && response.ok) {
    status.textContent = 'Setup link accepted. Opening the website editor…'
    location.assign('/_emdash/admin/setup')
    return
  }
  status.textContent = 'This setup link is not valid or has expired. Request a new one from Fellowship42.'
})()
</script>
</body>
</html>`

export const GET: APIRoute = () =>
  new Response(page, {
    headers: { ...noStore, 'Content-Type': 'text/html; charset=utf-8' },
  })

export const POST: APIRoute = async ({ request, url }) => {
  const settings = env()
  const origin = siteOrigin(settings, url)
  if (!origin || request.headers.get('Origin') !== origin)
    return Response.json(
      { ok: false, error: 'wrong_origin' },
      { status: 403, headers: noStore },
    )
  let claim: unknown
  try {
    claim = ((await request.json()) as { claim?: unknown }).claim
  } catch {
    claim = null
  }
  const verified =
    typeof claim === 'string'
      ? await verifySetupClaim(settings.WEBSITE_SETUP_SECRET, claim, {
          audience: origin,
        })
      : null
  if (!verified || typeof claim !== 'string')
    return Response.json(
      { ok: false, error: 'invalid_claim' },
      { status: 403, headers: noStore },
    )
  return Response.json(
    { ok: true, next: '/_emdash/admin/setup' },
    {
      headers: {
        ...noStore,
        'Set-Cookie': setupCookie(
          claim,
          verified.exp - Date.now() / 1000,
          origin.startsWith('https:'),
        ),
      },
    },
  )
}
