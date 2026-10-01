import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readConnectionConfig,
  resolveConnectionConfig,
  sourceFor,
  type ConnectionConfig,
} from './connection'

const digest = 'c'.repeat(64)
const other = 'e'.repeat(64)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('connection authority', () => {
  it('lets the deployment pin the address and identity over plugin settings', () => {
    expect(
      resolveConnectionConfig(
        {
          FELLOWSHIP42_URL: ' https://app.example.org ',
          FELLOWSHIP42_INSTANCE_SHA256: digest,
        },
        { instanceUrl: 'https://attacker.example', instanceSha256: other },
      ),
    ).toEqual({
      url: 'https://app.example.org',
      expectedInstanceSha256: digest,
      pinned: true,
      identityPinnedBy: 'deployment',
      issue: null,
    })
  })

  it('ignores the identity setting once the deployment pins the address', () => {
    expect(
      resolveConnectionConfig(
        { FELLOWSHIP42_URL: 'https://app.example.org' },
        { instanceSha256: other },
      ),
    ).toMatchObject({ expectedInstanceSha256: null, identityPinnedBy: null })
  })

  it('applies the deployment identity pin when the address comes from settings', () => {
    expect(
      resolveConnectionConfig(
        { FELLOWSHIP42_INSTANCE_SHA256: digest.toUpperCase() },
        { instanceUrl: 'https://app.example.org', instanceSha256: other },
      ),
    ).toEqual({
      url: 'https://app.example.org',
      expectedInstanceSha256: digest,
      pinned: false,
      identityPinnedBy: 'deployment',
      issue: null,
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
      identityPinnedBy: null,
      issue: null,
    })
    expect(resolveConnectionConfig({}, {})).toMatchObject({
      url: null,
      issue: null,
    })
  })
})

describe('identity pin', () => {
  it.each([
    ['a 16-character prefix', 'cccccccccccccccc'],
    ['the prefix with its ellipsis', 'cccccccccccccccc…'],
    ['the digest with its status', `${digest} (verified)`],
    ['a non-hex value', 'z'.repeat(64)],
  ])('reports %s as an invalid pin', (_name, pin) => {
    expect(
      resolveConnectionConfig(
        {},
        { instanceUrl: 'https://app.example.org', instanceSha256: pin },
      ),
    ).toMatchObject({
      identityPinnedBy: 'settings',
      issue: 'invalid-identity-pin',
    })
  })

  it('reports a malformed deployment pin too', () => {
    expect(
      resolveConnectionConfig(
        {
          FELLOWSHIP42_URL: 'https://app.example.org',
          FELLOWSHIP42_INSTANCE_SHA256: 'abc',
        },
        {},
      ),
    ).toMatchObject({
      identityPinnedBy: 'deployment',
      issue: 'invalid-identity-pin',
    })
  })
})

describe('private hosts in settings', () => {
  const settings = { instanceUrl: 'http://127.0.0.1:8787' }

  it('refuses a private address from plugin settings', () => {
    expect(resolveConnectionConfig({}, settings)).toMatchObject({
      issue: 'private-host',
    })
    expect(
      resolveConnectionConfig(
        { FELLOWSHIP42_ALLOW_PRIVATE_HOSTS: 'yes' },
        { instanceUrl: 'http://localhost:5173' },
      ),
    ).toMatchObject({ issue: 'private-host' })
  })

  it('allows it with the deployment opt-in or under astro dev', () => {
    expect(
      resolveConnectionConfig(
        { FELLOWSHIP42_ALLOW_PRIVATE_HOSTS: ' TRUE ' },
        settings,
      ),
    ).toMatchObject({ issue: null })
    expect(
      resolveConnectionConfig({}, settings, { development: true }),
    ).toMatchObject({ issue: null })
  })

  it('trusts an address the deployment pins', () => {
    expect(
      resolveConnectionConfig(
        { FELLOWSHIP42_URL: 'http://localhost:5173' },
        {},
      ),
    ).toMatchObject({ pinned: true, issue: null })
  })

  it('makes no request for a refused connection', async () => {
    const fetch = vi.fn()
    const source = sourceFor(resolveConnectionConfig({}, settings), fetch)
    for (const result of [
      await source.describe(),
      await source.church(),
      await source.list('events', { limit: 3 }),
    ])
      expect(result).toMatchObject({ ok: false, state: 'unavailable' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('makes no request for an invalid identity pin', async () => {
    const fetch = vi.fn()
    const result = await sourceFor(
      resolveConnectionConfig(
        {},
        {
          instanceUrl: 'https://app.example.org',
          instanceSha256: 'cccccccccccccccc',
        },
      ),
      fetch,
    ).church()
    expect(result).toMatchObject({ ok: false, state: 'unavailable' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('reading plugin settings', () => {
  it('reads no settings when the deployment pins the address', async () => {
    const read = vi.fn()
    const config = await readConnectionConfig(
      { FELLOWSHIP42_URL: 'https://app.example.org' },
      read,
    )
    expect(read).not.toHaveBeenCalled()
    expect(config).toMatchObject({ pinned: true, issue: null })
  })

  it('reads only the address when the deployment pins the identity', async () => {
    const read = vi.fn(async (key: string) =>
      key === 'instanceUrl' ? 'https://app.example.org' : other,
    )
    const config = await readConnectionConfig(
      { FELLOWSHIP42_INSTANCE_SHA256: digest },
      read,
    )
    expect(read.mock.calls).toEqual([['instanceUrl']])
    expect(config).toMatchObject({
      url: 'https://app.example.org',
      expectedInstanceSha256: digest,
    })
  })

  it('turns a failed read into the unavailable state and a log line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config: ConnectionConfig = await readConnectionConfig({}, () =>
      Promise.reject(new Error('EmDash database not configured')),
    )
    expect(config).toMatchObject({ url: null, issue: 'settings-unreadable' })
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('fellowship42.settings_unreadable'),
    )
    expect(await sourceFor(config, vi.fn()).church()).toMatchObject({
      ok: false,
      state: 'unavailable',
    })
  })
})
