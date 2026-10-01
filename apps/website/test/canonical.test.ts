import { describe, expect, it } from 'vitest'
import { canonicalUrl, publicOrigin } from '../src/lib/canonical'

const request = new URL('https://fellowship42-website.acct.workers.dev/about')

describe('public origin', () => {
  it('never takes the canonical host from the request when one is configured', () => {
    expect(
      publicOrigin({ EMDASH_SITE_URL: 'https://www.example.org/' }, request),
    ).toBe('https://www.example.org')
    expect(
      publicOrigin({ SITE_URL: 'https://site.example.org' }, request),
    ).toBe('https://site.example.org')
  })

  it('follows EmDash’s sitemap: site settings URL first', () => {
    expect(
      publicOrigin(
        { EMDASH_SITE_URL: 'https://www.example.org' },
        request,
        'https://church.example.org/',
      ),
    ).toBe('https://church.example.org')
  })

  it('skips unusable values and only then uses the request host', () => {
    expect(
      publicOrigin(
        { EMDASH_SITE_URL: 'not a url', SITE_URL: 'ftp://example.org' },
        request,
        '',
      ),
    ).toBe('https://fellowship42-website.acct.workers.dev')
  })
})

describe('canonical URL', () => {
  const origin = 'https://www.example.org'

  it('uses the public origin and the path without a trailing slash', () => {
    expect(canonicalUrl(origin, request)).toBe('https://www.example.org/about')
    expect(
      canonicalUrl(origin, new URL('https://x.workers.dev/articles/welcome/')),
    ).toBe('https://www.example.org/articles/welcome')
    expect(canonicalUrl(origin, new URL('https://x.workers.dev/'))).toBe(
      'https://www.example.org/',
    )
  })

  it('keeps paging parameters and drops everything else', () => {
    expect(
      canonicalUrl(
        origin,
        new URL(
          'https://x.workers.dev/events?utm_source=mail&f42-events=abc%2B1&_preview=t&cursor=',
        ),
      ),
    ).toBe('https://www.example.org/events?f42-events=abc%2B1')
    expect(
      canonicalUrl(
        origin,
        new URL('https://x.workers.dev/articles?cursor=xyz'),
      ),
    ).toBe('https://www.example.org/articles?cursor=xyz')
  })
})
