import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BLOCK_TYPES } from '@fellowship42/emdash/shared'
import { builtInPage, churchPages, homeBlocks } from '../src/lib/church-pages'
import { isInvalidCursorError } from '../src/lib/errors'

interface SeedSpan {
  text?: string
}
interface SeedBlock {
  _type: string
  children?: SeedSpan[]
}
interface Seed {
  menus: Array<{ items: Array<{ url: string }> }>
  content: {
    pages: Array<{
      slug: string
      status: string
      data: { content: SeedBlock[] }
    }>
  }
}

const seed = JSON.parse(
  readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'),
) as Seed

const knownBlocks = new Set<string>(Object.values(BLOCK_TYPES))

describe('built-in church pages', () => {
  it('answers every seeded menu link even when the seed content is skipped', () => {
    // EmDash applies seed menus even when the owner picks "Empty site".
    for (const { url } of seed.menus.flatMap((menu) => menu.items)) {
      const slug = url.replace(/^\//, '')
      expect(
        url === '/' || url === '/articles' || builtInPage(slug) !== undefined,
        `${url} has no built-in page`,
      ).toBe(true)
    }
  })

  it('only uses church blocks the integration renders', () => {
    for (const page of Object.values(churchPages))
      for (const block of page.blocks)
        expect(knownBlocks).toContain(block._type)
    for (const block of homeBlocks) expect(knownBlocks).toContain(block._type)
  })

  it('does not treat object built-ins as page slugs', () => {
    for (const slug of [
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
    ])
      expect(builtInPage(slug)).toBeUndefined()
    expect(builtInPage('visit')?.title).toBe('Plan a visit')
  })
})

describe('seeded pages', () => {
  it('speak to visitors, not to the editor', () => {
    for (const page of seed.content.pages.filter(
      (entry) => entry.status === 'published',
    )) {
      const text = page.data.content
        .flatMap((block) => block.children ?? [])
        .map((span) => span.text ?? '')
        .join(' ')
      expect(text, page.slug).not.toMatch(/website editor|edit this page/i)
    }
  })
})

describe('article paging errors', () => {
  it('recognises only EmDash’s malformed-cursor failure', () => {
    expect(
      isInvalidCursorError(
        new Error(
          'Failed to load collection: Invalid pagination cursor: garbage',
        ),
      ),
    ).toBe(true)
    const named = new Error('x')
    named.name = 'InvalidCursorError'
    expect(isInvalidCursorError(named)).toBe(true)
    expect(
      isInvalidCursorError(new Error('Failed to load collection: D1_ERROR')),
    ).toBe(false)
    expect(isInvalidCursorError(undefined)).toBe(false)
  })
})
