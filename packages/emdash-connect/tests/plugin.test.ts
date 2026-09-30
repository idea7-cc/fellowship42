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

  it('shows the connected church on the status page', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({ instanceUrl: origin })
    await host.http.respond(
      `${origin}/api/website/v1`,
      Response.json({
        ...envelope,
        site: { status: 'published' },
        church: { name: 'Grace Chapel', slug: 'grace' },
        origin,
      }),
    )
    const page = JSON.stringify(await host.admin.loadPage('/status'))
    expect(page).toContain('Connected to Fellowship42')
    expect(page).toContain('Grace Chapel')
    expect(page).toContain('Plugin settings (Administrators only)')
  })

  it('cannot reach a private address from the sandbox', async () => {
    host = await createPluginRuntimeTestHost()
    await host.actions.plugin.updateSettings({
      instanceUrl: 'http://localhost:5173',
    })
    expect((await route('church')).data).toMatchObject({
      ok: false,
      state: 'unavailable',
    })
  })
})
