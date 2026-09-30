import { describe, expect, it } from 'vitest'
import {
  createChurchSource,
  formatCalendarDate,
  formatEventWhen,
  formatServiceTime,
  isHttpUrl,
  localDateTimeAttribute,
  normalizeInstanceOrigin,
  parseChurch,
  parseDescriptor,
  parsePage,
  type ContractFetch,
} from './index.js'

const digest = 'a'.repeat(64)
const envelope = {
  contract: 'fellowship42-website',
  version: 1,
  instance: { portableIdentitySha256: digest },
}

const church = {
  ...envelope,
  church: {
    name: 'Grace Chapel',
    slug: 'grace',
    tagline: 'A church for the city',
    summary: 'We gather on Sundays.',
    timezone: 'America/New_York',
    address: {
      street: '1 Main St',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      countryCode: 'US',
    },
    contact: { phone: null, email: 'hello@example.org', website: null },
    links: { giving: 'https://give.example.org/', livestream: null },
    logo: { url: 'https://app.example.org/media/logo', alt: 'Logo' },
    cover: null,
    theme: { preset: 'warm' },
    serviceTimes: [{ label: 'Worship', day: 0, time: '10:30' }],
    futureField: 'ignored',
  },
}

const event = {
  id: 'event_1',
  slug: 'harvest',
  title: 'Harvest supper',
  summary: '',
  startsAt: '2026-10-04T14:00:00.000Z',
  endsAt: '2026-10-04T15:30:00.000Z',
  timezone: 'America/New_York',
  location: 'Hall',
  registrationUrl: null,
  featured: false,
}

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('parsers', () => {
  it('accepts a church document and ignores unknown fields', () => {
    const parsed = parseChurch(church)
    expect(parsed.church.name).toBe('Grace Chapel')
    expect(parsed.church.serviceTimes).toEqual([
      { label: 'Worship', day: 0, time: '10:30' },
    ])
    expect(parsed.church).not.toHaveProperty('futureField')
  })

  it('rejects another contract or major version', () => {
    expect(() => parseChurch({ ...church, version: 2 })).toThrow(
      'Expected fellowship42-website version 1',
    )
    expect(() => parseChurch({ ...church, contract: 'other' })).toThrow()
  })

  it('refuses non-http links rather than rendering them', () => {
    const unsafe = structuredClone(church)
    unsafe.church.links.giving = 'javascript:alert(1)'
    expect(() => parseChurch(unsafe)).toThrow('$.church.links.giving')
  })

  it('requires UTC instants, IANA zones, and real calendar dates', () => {
    expect(() =>
      parsePage('events', {
        ...envelope,
        items: [{ ...event, startsAt: '2026-10-04T10:00:00-04:00' }],
        nextCursor: null,
      }),
    ).toThrow('startsAt')
    expect(() =>
      parsePage('events', {
        ...envelope,
        items: [{ ...event, timezone: 'Mars/Olympus' }],
        nextCursor: null,
      }),
    ).toThrow('timezone')
    expect(() =>
      parsePage('sermons', {
        ...envelope,
        items: [
          {
            id: 's',
            slug: 's',
            title: 'S',
            speaker: 'P',
            series: null,
            summary: '',
            preachedOn: '2026-02-30',
            videoUrl: null,
            audio: null,
            featured: false,
          },
        ],
        nextCursor: null,
      }),
    ).toThrow('preachedOn')
  })

  it('hides church identity in an unpublished descriptor', () => {
    const parsed = parseDescriptor({
      ...envelope,
      site: { status: 'unpublished' },
      church: { name: 'Leaked', slug: 'leaked' },
      origin: 'https://app.example.org/',
    })
    expect(parsed.church).toBeNull()
    expect(parsed.origin).toBe('https://app.example.org')
  })
})

describe('createChurchSource', () => {
  const calls: string[] = []
  const fetchFor =
    (status: number, body: unknown): ContractFetch =>
    (url) => {
      calls.push(url)
      return jsonResponse(status, body)
    }

  it('normalizes the configured origin and pages with limit and cursor', async () => {
    calls.length = 0
    const source = createChurchSource({
      url: 'https://app.example.org/some/path?x=1',
      fetch: fetchFor(200, { ...envelope, items: [event], nextCursor: 'c2' }),
    })
    const page = await source.list('events', { limit: 500, cursor: 'c1' })
    expect(calls).toEqual([
      'https://app.example.org/api/website/v1/events?limit=100&cursor=c1',
    ])
    expect(page).toMatchObject({ ok: true, data: { nextCursor: 'c2' } })
  })

  it('reports each deliberate state', async () => {
    const states = await Promise.all([
      createChurchSource({ url: '', fetch: fetchFor(200, church) }).church(),
      createChurchSource({
        url: 'ftp://app.example.org',
        fetch: fetchFor(200, church),
      }).church(),
      createChurchSource({
        url: 'https://app.example.org',
        fetch: () => Promise.reject(new TypeError('network')),
      }).church(),
      createChurchSource({
        url: 'https://app.example.org',
        fetch: fetchFor(503, { error: { code: 'internal_error' } }),
      }).church(),
      createChurchSource({
        url: 'https://app.example.org',
        fetch: fetchFor(200, { ...church, version: 2 }),
      }).church(),
      createChurchSource({
        url: 'https://app.example.org',
        fetch: fetchFor(404, { error: { code: 'route_not_found' } }),
      }).church(),
      createChurchSource({
        url: 'https://app.example.org',
        fetch: fetchFor(404, {
          ...envelope,
          error: { code: 'site_unpublished', message: 'x' },
        }),
      }).church(),
      createChurchSource({
        url: 'https://app.example.org',
        expectedInstanceSha256: 'b'.repeat(64),
        fetch: fetchFor(200, church),
      }).church(),
      createChurchSource({
        url: 'https://app.example.org',
        expectedInstanceSha256: 'b'.repeat(64),
        fetch: fetchFor(404, {
          ...envelope,
          error: { code: 'site_unpublished', message: 'x' },
        }),
      }).church(),
      createChurchSource({
        url: 'https://app.example.org',
        fetch: fetchFor(400, {
          ...envelope,
          error: { code: 'invalid_cursor', message: 'x' },
        }),
      }).list('sermons', { cursor: 'bad' }),
    ])
    expect(states.map((state) => (state.ok ? 'ok' : state.state))).toEqual([
      'not-configured',
      'not-configured',
      'unavailable',
      'unavailable',
      'incompatible',
      'incompatible',
      'unpublished',
      'wrong-instance',
      'wrong-instance',
      'invalid-request',
    ])
  })

  it('accepts the pinned instance', async () => {
    const result = await createChurchSource({
      url: 'https://app.example.org',
      expectedInstanceSha256: digest.toUpperCase(),
      fetch: fetchFor(200, church),
    }).church()
    expect(result.ok).toBe(true)
  })
})

describe('formatting', () => {
  it('renders event times in the event zone', () => {
    expect(formatEventWhen(event as never, 'en-US')).toBe(
      'Sun, Oct 4, 2026 · 10:00 AM – 11:30 AM EDT',
    )
    expect(
      localDateTimeAttribute('2026-10-04T14:00:00.000Z', 'America/New_York'),
    ).toBe('2026-10-04T10:00-04:00')
    expect(
      localDateTimeAttribute('2026-10-04T14:00:00.000Z', 'Asia/Kolkata'),
    ).toBe('2026-10-04T19:30+05:30')
  })

  it('renders wall-clock service times and calendar dates without shifting', () => {
    expect(
      formatServiceTime({ label: 'x', day: 0, time: '10:30' }, 'en-US'),
    ).toBe('Sunday · 10:30 AM')
    expect(formatCalendarDate('2026-01-04', 'en-US')).toBe('January 4, 2026')
  })

  it('accepts only http(s) urls', () => {
    expect(isHttpUrl('https://example.org')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(normalizeInstanceOrigin('https://user:pw@example.org')).toBeNull()
  })
})

describe('setup claims', async () => {
  const { createSetupClaim, verifySetupClaim } = await import('./index.js')
  const secret = 's'.repeat(40)
  const now = Date.UTC(2026, 8, 30, 12)

  it('verifies an authentic, current claim for the website origin only', async () => {
    const { token } = await createSetupClaim(secret, {
      audience: 'https://www.example.org/any/path',
      subject: 'user_owner',
      now,
    })
    const ok = await verifySetupClaim(secret, token, {
      audience: 'https://www.example.org',
      now: now + 1_000,
    })
    expect(ok?.sub).toBe('user_owner')
    expect(
      await verifySetupClaim(secret, token, {
        audience: 'https://evil.example.org',
        now,
      }),
    ).toBeNull()
    expect(
      await verifySetupClaim('t'.repeat(40), token, {
        audience: 'https://www.example.org',
        now,
      }),
    ).toBeNull()
    expect(
      await verifySetupClaim(secret, token, {
        audience: 'https://www.example.org',
        now: now + 601_000,
      }),
    ).toBeNull()
    const [prefix, payload, signature] = token.split('.')
    const forged = JSON.parse(
      atob(payload!.replaceAll('-', '+').replaceAll('_', '/')),
    )
    forged.sub = 'someone_else'
    const tampered = `${prefix}.${btoa(JSON.stringify(forged)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}.${signature}`
    expect(
      await verifySetupClaim(secret, tampered, {
        audience: 'https://www.example.org',
        now,
      }),
    ).toBeNull()
  })

  it('refuses short secrets', async () => {
    await expect(
      createSetupClaim('short', { audience: 'https://x.org', subject: 'u' }),
    ).rejects.toThrow('too short')
    expect(
      await verifySetupClaim('short', 'f42ws1.a.b', {
        audience: 'https://x.org',
      }),
    ).toBeNull()
  })
})
