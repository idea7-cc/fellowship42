import { describe, expect, it } from 'vitest'
import {
  blockFlag,
  blockHeading,
  blockLimit,
  churchJsonLd,
  isHomePage,
  portableTextBlocks,
  BLOCK_TYPES,
} from './index'

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
