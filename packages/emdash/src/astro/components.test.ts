import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import type { AstroComponentFactory } from 'astro/runtime/server/index.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('emdash', () => ({ getPluginSetting: vi.fn(async () => null) }))

const { getPluginSetting } = await import('emdash')
// Plain `tsc` sees `.astro` modules through astro-modules.d.ts.
const component = async (load: Promise<{ default: unknown }>) =>
  (await load).default as AstroComponentFactory
const Events = await component(import('./Events.astro'))
const Sermons = await component(import('./Sermons.astro'))
const Groups = await component(import('./Groups.astro'))
const Courses = await component(import('./Courses.astro'))
const ChurchInfo = await component(import('./ChurchInfo.astro'))

const digest = 'd'.repeat(64)
const envelope = {
  contract: 'fellowship42-website',
  version: 1,
  instance: { portableIdentitySha256: digest },
}
const UNAVAILABLE =
  'Church information is temporarily unavailable. Please try again shortly.'

function pinDeployment() {
  vi.stubEnv('FELLOWSHIP42_URL', 'https://app.example.org')
  vi.stubEnv('FELLOWSHIP42_INSTANCE_SHA256', digest)
}

function answer(status: number, body: unknown) {
  const fetch = vi.fn(async () => Response.json(body, { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

let container: AstroContainer
beforeEach(async () => {
  vi.stubEnv('FELLOWSHIP42_URL', '')
  vi.stubEnv('FELLOWSHIP42_INSTANCE_SHA256', '')
  vi.stubEnv('FELLOWSHIP42_ALLOW_PRIVATE_HOSTS', '')
  container = await AstroContainer.create()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.mocked(getPluginSetting).mockReset()
})

describe('paginated list blocks', () => {
  it.each([
    ['events', Events],
    ['sermons', Sermons],
    ['groups', Groups],
    ['courses', Courses],
  ])(
    '%s offers the first page when the instance rejects a cursor',
    async (_name, Component) => {
      pinDeployment()
      answer(400, {
        ...envelope,
        error: { code: 'invalid_cursor', message: 'Unknown cursor' },
      })
      const html = await container.renderToString(Component, {
        props: { node: { _key: 'week', paginate: true, limit: 3 } },
        request: new Request('https://site.example/news?f42-week=stale&x=1'),
      })
      expect(html).toContain('Start again from the first page.')
      expect(html).toMatch(/<a href="\/news\?x=1"[^>]*>First page<\/a>/)
    },
  )
})

describe('connection failures render the unavailable notice', () => {
  it('when plugin settings cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(getPluginSetting).mockRejectedValue(
      new Error('EmDash database not configured'),
    )
    const fetch = answer(200, {})
    const html = await container.renderToString(ChurchInfo, {
      props: { node: {} },
      request: new Request('https://site.example/'),
    })
    expect(html).toContain(UNAVAILABLE)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('without reading settings when the deployment pins the address', async () => {
    pinDeployment()
    answer(503, {})
    await container.renderToString(Events, {
      props: { node: {} },
      request: new Request('https://site.example/'),
    })
    expect(getPluginSetting).not.toHaveBeenCalled()
  })
})

describe('theme components', () => {
  it('give two keyless components on one page distinct heading ids', async () => {
    pinDeployment()
    answer(200, { ...envelope, items: [], nextCursor: null })
    const request = new Request('https://site.example/')
    const first = await container.renderToString(Events, {
      props: { node: { heading: 'This week' } },
      request,
    })
    const second = await container.renderToString(Events, {
      props: { node: { heading: 'Later' } },
      request,
    })
    const ids = [first, second].map(
      (html) => /<h2 id="([^"]+)"/.exec(html)?.[1],
    )
    expect(ids).toEqual(['f42-f42Events-heading', 'f42-f42Events-heading-2'])
    expect(second).toContain('aria-labelledby="f42-f42Events-heading-2"')
  })
})
