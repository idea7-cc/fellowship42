import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { astroDevelopment, loadConnection } from './environment'

const privateAddress = async (key: string) =>
  key === 'instanceUrl' ? 'http://localhost:5173' : null

beforeEach(() => {
  vi.stubEnv('FELLOWSHIP42_URL', '')
  vi.stubEnv('FELLOWSHIP42_ALLOW_PRIVATE_HOSTS', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

// Vitest runs modules through Vite in development mode, as `astro dev` does.
// Production refusal is covered with `development: false` in
// shared/connection.test.ts and by the EmDash-first acceptance build.
describe('astro dev', () => {
  it('reads the build mode Vite sets', () => {
    expect(astroDevelopment()).toBe(true)
  })

  it('lets a private settings address through in development', async () => {
    expect(await loadConnection(privateAddress)).toMatchObject({
      url: 'http://localhost:5173',
      issue: null,
    })
  })
})
