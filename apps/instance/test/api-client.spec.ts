import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../src/lib/api'

afterEach(() => vi.restoreAllMocks())

describe('browser API client', () => {
  it('accepts successful no-content mutations without parsing JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    )

    await expect(
      apiRequest('/api/example', { method: 'DELETE' }),
    ).resolves.toBeUndefined()
  })
})
