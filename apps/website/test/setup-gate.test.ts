import { describe, expect, it } from 'vitest'
import { createSetupClaim } from '@fellowship42/website-contract'
import {
  SETUP_COOKIE,
  hasSetupClaim,
  isGatedSetupPath,
  readCookie,
  setupCookie,
  siteOrigin,
} from '../src/lib/setup-gate'

const secret = 'website-setup-secret-that-is-long-enough'
const site = 'https://www.example.org'

async function requestWith(
  cookie: string | null,
  url = `${site}/_emdash/api/setup`,
) {
  return new Request(url, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  })
}

describe('setup gate', () => {
  it('gates every EmDash setup route except the read-only status', () => {
    expect(isGatedSetupPath('/_emdash/api/setup', 'POST')).toBe(true)
    expect(isGatedSetupPath('/_emdash/api/setup/admin', 'POST')).toBe(true)
    expect(isGatedSetupPath('/_emdash/api/setup/admin/verify', 'POST')).toBe(
      true,
    )
    expect(isGatedSetupPath('/_emdash/api/setup/dev-bypass', 'GET')).toBe(true)
    expect(isGatedSetupPath('/_emdash/api/setup/dev-reset', 'POST')).toBe(true)
    expect(isGatedSetupPath('/_emdash/admin/setup/', 'GET')).toBe(true)
    expect(isGatedSetupPath('/_emdash/api/setup/status', 'GET')).toBe(false)
    expect(isGatedSetupPath('/_emdash/admin', 'GET')).toBe(false)
    expect(isGatedSetupPath('/_emdash/api/content/pages', 'POST')).toBe(false)
  })

  it('accepts only an authentic, current claim for this site', async () => {
    const env = { WEBSITE_SETUP_SECRET: secret, EMDASH_SITE_URL: `${site}/` }
    const { token } = await createSetupClaim(secret, {
      audience: site,
      subject: 'user_owner',
    })
    const other = await createSetupClaim(secret, {
      audience: 'https://other.example.org',
      subject: 'user_owner',
    })
    expect(
      await hasSetupClaim(env, await requestWith(`${SETUP_COOKIE}=${token}`)),
    ).toBe(true)
    expect(await hasSetupClaim(env, await requestWith(null))).toBe(false)
    expect(
      await hasSetupClaim(
        env,
        await requestWith(`${SETUP_COOKIE}=${other.token}`),
      ),
    ).toBe(false)
    expect(
      await hasSetupClaim(
        { ...env, WEBSITE_SETUP_SECRET: 'x'.repeat(40) },
        await requestWith(`${SETUP_COOKIE}=${token}`),
      ),
    ).toBe(false)
    // Without a configured secret the gate stays closed.
    expect(
      await hasSetupClaim(
        { EMDASH_SITE_URL: site },
        await requestWith(`${SETUP_COOKIE}=${token}`),
      ),
    ).toBe(false)
    expect(
      await hasSetupClaim(
        env,
        await requestWith(`${SETUP_COOKIE}=${token}`),
        Date.now() + 601_000,
      ),
    ).toBe(false)
  })

  it('uses the configured site origin, never widening on bad configuration', () => {
    expect(
      siteOrigin(
        { EMDASH_SITE_URL: 'https://www.example.org/x' },
        new URL('http://evil/'),
      ),
    ).toBe(site)
    expect(siteOrigin({}, new URL('http://localhost:4322/a'))).toBe(
      'http://localhost:4322',
    )
    expect(
      siteOrigin({ EMDASH_SITE_URL: 'not a url' }, new URL('http://evil/')),
    ).toBeNull()
  })

  it('scopes the cookie to EmDash paths', () => {
    const cookie = setupCookie('value', 599.7, true)
    expect(cookie).toBe(
      'f42_website_setup=value; Path=/_emdash; HttpOnly; SameSite=Strict; Max-Age=599; Secure',
    )
    expect(
      readCookie('a=1; f42_website_setup=abc.def; b=2', SETUP_COOKIE),
    ).toBe('abc.def')
  })
})
