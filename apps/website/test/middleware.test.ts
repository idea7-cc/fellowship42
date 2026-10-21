import { describe, expect, it, vi } from 'vitest'
import { createSetupClaim } from '@fellowship42/website-contract'
import { createOuterMiddleware, withPublicHeaders } from '../src/lib/middleware'
import { SETUP_COOKIE, type GateEnv } from '../src/lib/setup-gate'

const secret = 'website-setup-secret-that-is-long-enough'
const site = 'https://www.example.org'

function run(
  env: GateEnv,
  path: string,
  init: RequestInit = {},
  response: Response = new Response('<p>ok</p>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }),
) {
  const next = vi.fn(async () => response)
  const request = new Request(`${site}${path}`, init)
  const handler = createOuterMiddleware(() => env)
  return {
    next,
    result: handler({ request, url: new URL(request.url) }, next),
  }
}

describe('outer middleware', () => {
  const setupOpen = { WEBSITE_SETUP_SECRET: secret, EMDASH_SITE_URL: site }

  it('redirects the setup wizard to the Fellowship42 handoff without a claim', async () => {
    const { next, result } = run(setupOpen, '/_emdash/admin/setup')
    const response = await result
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(`${site}/fellowship42/setup`)
    expect(next).not.toHaveBeenCalled()
  })

  it('refuses setup API calls without a claim, as uncacheable JSON', async () => {
    const { next, result } = run(setupOpen, '/_emdash/api/setup/admin', {
      method: 'POST',
    })
    const response = await result
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({
      error: { code: 'FELLOWSHIP42_SETUP_CLAIM_REQUIRED' },
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('lets setup continue with a valid owner claim', async () => {
    const { token } = await createSetupClaim(secret, {
      audience: site,
      subject: 'user_owner',
    })
    const { next, result } = run(setupOpen, '/_emdash/api/setup/admin', {
      method: 'POST',
      headers: { cookie: `${SETUP_COOKIE}=${token}` },
    })
    expect((await result).status).toBe(200)
    expect(next).toHaveBeenCalledOnce()
  })

  it('refuses OAuth sign-in while setup is open, even with a claim', async () => {
    const { token } = await createSetupClaim(secret, {
      audience: site,
      subject: 'user_owner',
    })
    for (const path of [
      '/_emdash/api/auth/oauth/github',
      '/_emdash/api/auth/oauth/google/',
    ]) {
      const { next, result } = run(setupOpen, path, {
        headers: { cookie: `${SETUP_COOKIE}=${token}` },
      })
      const response = await result
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({
        error: { code: 'FELLOWSHIP42_OAUTH_CLOSED_DURING_SETUP' },
      })
      expect(next).not.toHaveBeenCalled()
    }
  })

  it('never gates the OAuth callback, and allows OAuth once setup is closed', async () => {
    const callback = run(setupOpen, '/_emdash/api/auth/oauth/github/callback')
    expect((await callback.result).status).toBe(200)
    expect(callback.next).toHaveBeenCalledOnce()

    const closed = run(
      { EMDASH_SITE_URL: site },
      '/_emdash/api/auth/oauth/github',
    )
    expect((await closed.result).status).toBe(200)
    expect(closed.next).toHaveBeenCalledOnce()
  })

  it('keeps setup closed when no setup secret is configured', async () => {
    const { result } = run({ EMDASH_SITE_URL: site }, '/_emdash/api/setup', {
      method: 'POST',
    })
    expect((await result).status).toBe(403)
  })

  it('passes other EmDash routes through untouched', async () => {
    const { next, result } = run(setupOpen, '/_emdash/api/setup/status')
    expect((await result).status).toBe(200)
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('public headers', () => {
  const html = (headers: Record<string, string> = {}) =>
    new Response('<p>ok</p>', {
      status: 201,
      statusText: 'Created',
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
    })

  it('marks public HTML no-cache so withdrawals show on the next visit', async () => {
    const response = withPublicHeaders(html(), '/events')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    )
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
    expect(await response.text()).toBe('<p>ok</p>')
  })

  it('keeps a page’s own Cache-Control, such as a private preview', () => {
    const response = withPublicHeaders(
      html({ 'Cache-Control': 'private, no-store' }),
      '/about',
    )
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('leaves EmDash routes and non-HTML responses to EmDash', () => {
    expect(
      withPublicHeaders(html(), '/_emdash/admin').headers.get('Cache-Control'),
    ).toBeNull()
    const json = withPublicHeaders(Response.json({ ok: true }), '/sitemap.xml')
    expect(json.headers.get('Cache-Control')).toBeNull()
    expect(json.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('does not replace security headers a route already set', () => {
    const response = withPublicHeaders(
      html({ 'Referrer-Policy': 'no-referrer' }),
      '/fellowship42/setup',
    )
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  })
})
