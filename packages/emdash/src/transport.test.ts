import { afterEach, describe, expect, it, vi } from 'vitest'

// The Workers runtime module, as a same-account deployment provides it.
const bound = vi.hoisted(() => ({
  fetch: vi.fn(async () => Response.json({ via: 'binding' })),
}))
vi.mock('cloudflare:workers', () => ({ env: { FELLOWSHIP42: bound } }))

const { contractTransport, serviceBinding } = await import('./transport')
const { resolveConnectionConfig, sourceFor } =
  await import('./shared/connection')

const digest = 'd'.repeat(64)
const descriptor = {
  contract: 'fellowship42-website',
  version: 1,
  instance: { portableIdentitySha256: digest },
  site: { status: 'published' },
  church: { name: 'Grace Chapel', slug: 'grace' },
  origin: 'https://app.example.org',
}
const init = {
  method: 'GET' as const,
  headers: { accept: 'application/json' },
  redirect: 'manual' as const,
}

afterEach(() => {
  vi.unstubAllGlobals()
  bound.fetch.mockClear()
})

describe('service binding transport', () => {
  it('resolves the FELLOWSHIP42 binding from cloudflare:workers', async () => {
    expect(await serviceBinding()).toBe(bound)
  })

  it('carries requests for an address the deployment pins', async () => {
    const publicFetch = vi.fn()
    vi.stubGlobal('fetch', publicFetch)
    bound.fetch.mockResolvedValueOnce(Response.json(descriptor))
    const config = resolveConnectionConfig(
      {
        FELLOWSHIP42_URL: 'https://app.example.org',
        FELLOWSHIP42_INSTANCE_SHA256: digest,
      },
      {},
    )
    const result = await sourceFor(config, contractTransport(config)).describe()
    expect(result).toMatchObject({
      ok: true,
      data: { church: { name: 'Grace Chapel' } },
    })
    expect(bound.fetch).toHaveBeenCalledWith(
      'https://app.example.org/api/website/v1',
      expect.objectContaining({ method: 'GET', redirect: 'manual' }),
    )
    expect(publicFetch).not.toHaveBeenCalled()
  })

  it('never carries an address from plugin settings', async () => {
    const publicFetch = vi.fn(async () => Response.json(descriptor))
    vi.stubGlobal('fetch', publicFetch)
    const config = resolveConnectionConfig(
      {},
      { instanceUrl: 'https://other-church.example' },
    )
    await contractTransport(config)(
      'https://other-church.example/api/website/v1',
      init,
    )
    expect(publicFetch).toHaveBeenCalledOnce()
    expect(bound.fetch).not.toHaveBeenCalled()
  })

  it('uses public fetch when no binding is present', async () => {
    const publicFetch = vi.fn(async () => Response.json(descriptor))
    vi.stubGlobal('fetch', publicFetch)
    await contractTransport({ pinned: true }, async () => null)(
      'https://app.example.org/api/website/v1',
      init,
    )
    expect(publicFetch).toHaveBeenCalledOnce()
  })
})
