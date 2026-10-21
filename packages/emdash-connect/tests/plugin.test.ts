import { afterEach, describe, expect, it } from 'vitest'
import {
  createPluginRuntimeTestHost,
  type PluginRuntimeTestHost,
} from '@emdash-cms/plugin-test'

// These tests run the built plugin through EmDash's production sandbox
// boundary (Worker Loader + PluginBridge on workerd).

const origin = 'https://app.example.org'
const digest = 'd'.repeat(64)
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
    tagline: 'For the city',
    summary: 'We gather on Sundays.',
    timezone: 'America/Chicago',
    address: {
      street: '1 Main St',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      countryCode: 'US',
    },
    contact: { phone: null, email: null, website: null },
    links: { giving: null, livestream: null },
    logo: null,
    cover: null,
    theme: { preset: 'calm' },
    serviceTimes: [{ label: 'Worship', day: 0, time: '10:00' }],
  },
}

const descriptor = () =>
  Response.json({
    ...envelope,
    site: { status: 'published' },
    church: { name: 'Grace Chapel', slug: 'grace' },
    origin,
  })

const user = (role: number) => ({
  id: `user-${role}`,
  email: `role-${role}@example.test`,
  name: `Role ${role}`,
  role,
  createdAt: new Date(0).toISOString(),
})

const blocksOf = (page: unknown) =>
  ((page as { blocks?: Record<string, unknown>[] }).blocks ?? []) as Record<
    string,
    unknown
  >[]

let host: PluginRuntimeTestHost | undefined
afterEach(async () => {
  await host?.dispose()
  host = undefined
})

async function route(
  name: string,
  url = `https://site.example/_emdash/api/plugins/fellowship42-connect/${name}`,
) {
  const response = await host!.actions.routes.request(name, {
    method: 'GET',
    url,
  })
  return (await response.json()) as {
    success: boolean
    data: { ok: boolean; state?: string; data?: Record<string, unknown> }
  }
}

describe('fellowship42-connect in the EmDash sandbox', () => {
  it('reports an unconfigured connection without making requests', async () => {
    host = await createPluginRuntimeTestHost()
    const page = await host.admin.loadPage('/status')
    expect(JSON.stringify(page)).toContain('Not connected to Fellowship42')
    expect(JSON.stringify(page)).toContain(
      'trusted @fellowship42/emdash package',
    )
    expect((await route('church')).data).toMatchObject({
      ok: false,
      state: 'not-configured',
    })
    expect(host.http.requests()).toHaveLength(0)
  })

  it('reads the public contract with no credentials', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({ instanceUrl: origin })
    await host.http.respond(
      `${origin}/api/website/v1/church`,
      Response.json(church),
    )
    const result = await route('church')
    expect(result.data).toMatchObject({
      ok: true,
      data: { church: { name: 'Grace Chapel' } },
    })
    const [request] = host.http.requests()
    expect(request?.url).toBe(`${origin}/api/website/v1/church`)
    expect(request?.method).toBe('GET')
    expect(
      Object.keys(request?.headers ?? {}).map((key) => key.toLowerCase()),
    ).not.toContain('authorization')
  })

  it('passes paging through and refuses a different church', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({
      instanceUrl: origin,
      instanceSha256: 'e'.repeat(64),
    })
    await host.http.respond(
      `${origin}/api/website/v1/events?limit=5&cursor=abc`,
      Response.json({ ...envelope, items: [], nextCursor: null }),
    )
    const result = await route(
      'events',
      'https://site.example/_emdash/api/plugins/fellowship42-connect/events?limit=5&cursor=abc',
    )
    expect(host.http.requests()[0]?.url).toBe(
      `${origin}/api/website/v1/events?limit=5&cursor=abc`,
    )
    expect(result.data).toMatchObject({ ok: false, state: 'wrong-instance' })
  })

  it('shows the connected church and its full digest on the status page', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({ instanceUrl: origin })
    await host.http.respond(`${origin}/api/website/v1`, descriptor())
    const page = await host.admin.loadPage('/status')
    const text = JSON.stringify(page)
    expect(text).toContain('Connected to Fellowship42')
    expect(text).toContain('Grace Chapel')
    expect(text).toContain('Plugin settings (Administrators only)')
    expect(blocksOf(page)).toContainEqual(
      expect.objectContaining({ type: 'code', code: digest }),
    )
    // The page loads as an Administrator by default.
    expect(text).toContain('plugin-settings')
  })

  it('lets Contributors read the status page without the settings link', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({ instanceUrl: origin })
    await host.http.respond(`${origin}/api/website/v1`, descriptor())
    const page = JSON.stringify(
      await host.admin.loadPage('/status', { user: user(20) }),
    )
    expect(page).toContain('Where content is edited')
    expect(page).not.toContain('plugin-settings')
    await expect(
      host.admin.loadPage('/status', { user: user(10) }),
    ).rejects.toThrow(/403/)
  })

  it('reports a malformed identity pin as its own state', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({
      instanceUrl: origin,
      instanceSha256: `${digest.slice(0, 16)}…`,
    })
    await host.http.respond(`${origin}/api/website/v1`, descriptor())
    const page = await host.admin.loadPage('/status')
    expect(JSON.stringify(page)).toContain(
      'The church identity pin is not a valid 64-character digest',
    )
    expect(blocksOf(page)).toContainEqual(
      expect.objectContaining({ type: 'code', code: digest }),
    )
    expect((await route('church')).data).toMatchObject({
      ok: false,
      state: 'unavailable',
    })
  })

  it('refuses a private address before making any request', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({
      instanceUrl: 'http://localhost:5173',
    })
    expect((await route('church')).data).toMatchObject({
      ok: false,
      state: 'unavailable',
    })
    expect(JSON.stringify(await host.admin.loadPage('/status'))).toContain(
      'The Fellowship42 address is a local or private address',
    )
    expect(host.http.requests()).toHaveLength(0)
  })

  it('does not follow redirects, like the trusted integration', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({ instanceUrl: origin })
    await host.http.respond(
      `${origin}/api/website/v1/church`,
      new Response(null, {
        status: 301,
        headers: { location: 'https://www.example.org/api/website/v1/church' },
      }),
    )
    await host.http.respond(
      'https://www.example.org/api/website/v1/church',
      Response.json(church),
    )
    expect((await route('church')).data).toMatchObject({
      ok: false,
      state: 'incompatible',
    })
    expect(host.http.requests().map((request) => request.url)).toEqual([
      `${origin}/api/website/v1/church`,
    ])
  })
})

describe('fellowship42-connect structured data', () => {
  const page = (path: string) => ({
    page: {
      url: `https://site.example${path}`,
      path,
      locale: null,
      kind: 'custom',
      pageType: 'website',
      title: 'Grace Chapel',
      description: null,
      canonical: null,
      image: null,
    },
  })

  it('adds the church JSON-LD to the home page only', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({ instanceUrl: origin })
    await host.http.respond(
      `${origin}/api/website/v1/church`,
      Response.json(church),
    )
    const home = await host.transport.invokeHook('page:metadata', page('/'))
    expect(home).toMatchObject({
      kind: 'jsonld',
      id: 'fellowship42-church',
      graph: {
        '@type': 'Church',
        name: 'Grace Chapel',
        url: 'https://site.example/',
        address: { addressLocality: 'Springfield' },
      },
    })
    expect(
      await host.transport.invokeHook('page:metadata', page('/about')),
    ).toBeNull()
    expect(host.http.requests()).toHaveLength(1)
  })

  it('adds nothing while the church is unpublished or unconnected', async () => {
    host = await createPluginRuntimeTestHost()
    expect(
      await host.transport.invokeHook('page:metadata', page('/')),
    ).toBeNull()
    await host.actions.plugin.updateSettings({ instanceUrl: origin })
    await host.http.respond(
      `${origin}/api/website/v1/church`,
      Response.json(
        {
          ...envelope,
          error: { code: 'site_unpublished', message: 'Not published' },
        },
        { status: 404 },
      ),
    )
    expect(
      await host.transport.invokeHook('page:metadata', page('/')),
    ).toBeNull()
  })
})
