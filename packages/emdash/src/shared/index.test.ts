import { describe, expect, it } from 'vitest'
import {
  blockFlag,
  blockHeading,
  blockLimit,
  churchJsonLd,
  connectionStatusBlocks,
  isHomePage,
  portableTextBlocks,
  resolveConnectionConfig,
  BLOCK_TYPES,
} from './index'

const digest = 'c'.repeat(64)

describe('connection authority', () => {
  it('lets the deployment pin the connection over plugin settings', () => {
    expect(
      resolveConnectionConfig(
        {
          FELLOWSHIP42_URL: ' https://app.example.org ',
          FELLOWSHIP42_INSTANCE_SHA256: digest,
        },
        { instanceUrl: 'https://attacker.example', instanceSha256: 'x' },
      ),
    ).toEqual({
      url: 'https://app.example.org',
      expectedInstanceSha256: digest,
      pinned: true,
    })
  })

  it('falls back to Administrator settings when unpinned', () => {
    expect(
      resolveConnectionConfig(
        { FELLOWSHIP42_URL: '   ' },
        { instanceUrl: 'https://app.example.org', instanceSha256: '' },
      ),
    ).toEqual({
      url: 'https://app.example.org',
      expectedInstanceSha256: null,
      pinned: false,
    })
    expect(resolveConnectionConfig({}, {})).toMatchObject({ url: null })
  })
})

describe('block settings', () => {
  it('declares every block type with display-only fields', () => {
    expect(portableTextBlocks.map((block) => block.type)).toEqual(
      Object.values(BLOCK_TYPES),
    )
    for (const block of portableTextBlocks)
      for (const field of block.fields)
        expect([
          'heading',
          'limit',
          'paginate',
          'showAbout',
          'showContact',
        ]).toContain(field.action_id)
  })

  it('bounds untrusted block values', () => {
    expect(blockLimit({ limit: 500 }, 5)).toBe(5)
    expect(blockLimit({ limit: '7' }, 5)).toBe(7)
    expect(blockLimit({ limit: 2.5 }, 5)).toBe(5)
    expect(blockHeading({ heading: '  Events ' }, 'x')).toBe('Events')
    expect(blockHeading({ heading: 3 }, 'Fallback')).toBe('Fallback')
    expect(blockFlag('yes', false)).toBe(false)
  })
})

describe('status page', () => {
  const pinned = {
    url: 'https://app.example.org',
    expectedInstanceSha256: digest,
    pinned: true,
  }

  it('explains a healthy pinned connection and where content is edited', () => {
    const { blocks } = connectionStatusBlocks(pinned, {
      ok: true,
      data: {
        contract: 'fellowship42-website',
        version: 1,
        instance: { portableIdentitySha256: digest },
        site: { status: 'published' },
        church: { name: 'Grace Chapel', slug: 'grace' },
        origin: 'https://app.example.org',
      },
    })
    const text = JSON.stringify(blocks)
    expect(text).toContain('Connected to Fellowship42')
    expect(text).toContain('Grace Chapel')
    expect(text).toContain('Website deployment (cannot be changed here)')
    expect(text).toContain('Where content is edited')
    expect(text).not.toContain('plugin-settings')
  })

  it('names each failure state', () => {
    for (const state of [
      'not-configured',
      'unavailable',
      'incompatible',
      'wrong-instance',
      'unpublished',
    ] as const) {
      const { blocks } = connectionStatusBlocks(
        { ...pinned, pinned: false },
        { ok: false, state, message: `message for ${state}` },
      )
      expect(JSON.stringify(blocks)).toContain(`message for ${state}`)
      expect(JSON.stringify(blocks)).toContain('plugin-settings')
    }
  })
})

describe('structured data', () => {
  it('describes the church for the home page only', () => {
    expect(isHomePage('/')).toBe(true)
    expect(isHomePage('/about')).toBe(false)
    const graph = churchJsonLd(
      {
        name: 'Grace Chapel',
        slug: 'grace',
        tagline: '',
        summary: 'A church',
        timezone: 'America/New_York',
        address: {
          street: '1 Main',
          city: 'Springfield',
          region: 'IL',
          postalCode: '62701',
          countryCode: 'US',
        },
        contact: { phone: null, email: null, website: null },
        links: { giving: null, livestream: null },
        logo: null,
        cover: null,
        theme: { preset: 'warm' },
        serviceTimes: [],
      },
      'https://www.example.org/',
    )
    expect(graph).toMatchObject({
      '@type': 'Church',
      name: 'Grace Chapel',
      address: { addressLocality: 'Springfield' },
    })
  })
})
