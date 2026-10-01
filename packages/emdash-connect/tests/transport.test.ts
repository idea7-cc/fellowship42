import { describe, expect, it, vi } from 'vitest'
import { sandboxTransport } from '../src/transport'

const init = {
  method: 'GET' as const,
  headers: { accept: 'application/json' },
  redirect: 'manual' as const,
}

describe('sandbox transport', () => {
  it('forwards the redirect policy to ctx.http', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    await sandboxTransport({ fetch })('https://app.example.org/x', init)
    expect(fetch).toHaveBeenCalledWith('https://app.example.org/x', {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'manual',
    })
  })

  it("applies the client's timeout to a stalled instance", async () => {
    const stalled = { fetch: () => new Promise<Response>(() => {}) }
    await expect(
      sandboxTransport(stalled)('https://app.example.org/x', {
        ...init,
        signal: AbortSignal.timeout(20),
      }),
    ).rejects.toThrow()
  })

  it('refuses when the network capability is missing', async () => {
    await expect(
      sandboxTransport(undefined)('https://app.example.org/x', init),
    ).rejects.toThrow('network not granted')
  })
})
