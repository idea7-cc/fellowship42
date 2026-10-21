import { describe, expect, it, vi } from 'vitest'
import type {
  ContractFetch,
  WebsiteDescriptor,
} from '@fellowship42/website-contract'
import { resolveConnectionConfig, type ConnectionConfig } from './connection'
import { connectionStatus, connectionStatusBlocks } from './status'

const digest = 'c'.repeat(64)
const origin = 'https://app.example.org'
const descriptor: WebsiteDescriptor = {
  contract: 'fellowship42-website',
  version: 1,
  instance: { portableIdentitySha256: digest },
  site: { status: 'published' },
  church: { name: 'Grace Chapel', slug: 'grace' },
  origin,
}

const pinned: ConnectionConfig = {
  url: origin,
  expectedInstanceSha256: digest,
  pinned: true,
  identityPinnedBy: 'deployment',
  issue: null,
}
const fromSettings: ConnectionConfig = {
  url: origin,
  expectedInstanceSha256: null,
  pinned: false,
  identityPinnedBy: null,
  issue: null,
}

type Block = Record<string, unknown>
const blocksOf = (page: { blocks: Block[] }) => page.blocks
const banner = (blocks: Block[]) => blocks.find((b) => b.type === 'banner')
const fields = (blocks: Block[]) =>
  Object.fromEntries(
    (
      blocks.find((b) => b.type === 'fields')?.fields as {
        label: string
        value: string
      }[]
    ).map((field) => [field.label, field.value]),
  )
const code = (blocks: Block[]) =>
  blocks.find((b) => b.type === 'code')?.code ?? null
const hasSettingsLink = (blocks: Block[]) =>
  JSON.stringify(blocks).includes('plugin-settings')

describe('status page', () => {
  it('explains a healthy pinned connection and where content is edited', () => {
    const blocks = blocksOf(
      connectionStatusBlocks(
        pinned,
        { ok: true, data: descriptor },
        { viewerRole: 50 },
      ),
    )
    const text = JSON.stringify(blocks)
    expect(banner(blocks)?.title).toBe('Connected to Fellowship42')
    expect(fields(blocks)).toMatchObject({
      Church: 'Grace Chapel',
      'Connection set by': 'Website deployment (cannot be changed here)',
      'Identity pin': 'Set by the website deployment (verified)',
    })
    expect(text).toContain('Where content is edited')
    expect(hasSettingsLink(blocks)).toBe(false)
  })

  it('shows the full identity digest as copyable text', () => {
    const blocks = blocksOf(
      connectionStatusBlocks(fromSettings, { ok: true, data: descriptor }),
    )
    expect(code(blocks)).toBe(digest)
    expect(fields(blocks)['Identity pin']).toBe('Not set')
    expect(JSON.stringify(blocks)).toContain(
      'copy this full digest into Church identity in the connection settings',
    )
  })

  it('names each failure state', () => {
    for (const state of [
      'not-configured',
      'unavailable',
      'incompatible',
      'wrong-instance',
      'unpublished',
    ] as const) {
      const blocks = blocksOf(
        connectionStatusBlocks(
          fromSettings,
          { ok: false, state, message: `message for ${state}` },
          { viewerRole: 50 },
        ),
      )
      expect(JSON.stringify(blocks)).toContain(`message for ${state}`)
      expect(hasSettingsLink(blocks)).toBe(true)
      expect(code(blocks)).toBeNull()
    }
  })

  it('offers the settings link to Administrators only', () => {
    const result = { ok: true as const, data: descriptor }
    for (const [role, link] of [
      [undefined, false],
      [20, false],
      [30, false],
      [40, false],
      [50, true],
    ] as const)
      expect(
        hasSettingsLink(
          blocksOf(
            connectionStatusBlocks(fromSettings, result, { viewerRole: role }),
          ),
        ),
      ).toBe(link)
  })

  it('explains a refused private address', () => {
    const config = resolveConnectionConfig(
      {},
      { instanceUrl: 'http://169.254.169.254' },
    )
    const blocks = blocksOf(
      connectionStatusBlocks(config, {
        ok: false,
        state: 'unavailable',
        message: 'refused',
      }),
    )
    expect(banner(blocks)).toMatchObject({
      title: 'The Fellowship42 address is a local or private address',
      variant: 'error',
    })
    expect(String(banner(blocks)?.description)).toContain(
      'FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true',
    )
  })

  it('explains unreadable settings', () => {
    const blocks = blocksOf(
      connectionStatusBlocks(
        { ...fromSettings, url: null, issue: 'settings-unreadable' },
        { ok: false, state: 'unavailable', message: 'x' },
      ),
    )
    expect(banner(blocks)?.title).toBe(
      'The Fellowship42 connection settings could not be read',
    )
  })
})

describe('malformed identity pin', () => {
  const prefixPin = resolveConnectionConfig(
    {},
    { instanceUrl: origin, instanceSha256: `${digest.slice(0, 16)}…` },
  )

  it('is its own state, and the page still shows the digest to copy', async () => {
    const fetch = vi.fn<ContractFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => descriptor,
    }))
    const blocks = blocksOf(
      await connectionStatus(prefixPin, fetch, { viewerRole: 50 }),
    )
    expect(banner(blocks)).toMatchObject({
      title: 'The church identity pin is not a valid 64-character digest',
      variant: 'error',
    })
    expect(fields(blocks)['Identity pin']).toBe(
      'Set in plugin settings (not a valid digest)',
    )
    expect(code(blocks)).toBe(digest)
    expect(hasSettingsLink(blocks)).toBe(true)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('tells the deployment which digest to set', () => {
    const config = resolveConnectionConfig(
      { FELLOWSHIP42_URL: origin, FELLOWSHIP42_INSTANCE_SHA256: 'abc' },
      {},
    )
    const blocks = blocksOf(
      connectionStatusBlocks(config, { ok: true, data: descriptor }),
    )
    expect(banner(blocks)?.title).toBe(
      'The church identity pin is not a valid 64-character digest',
    )
    expect(JSON.stringify(blocks)).toContain(
      'Set FELLOWSHIP42_INSTANCE_SHA256 in the website deployment to this full digest.',
    )
  })

  it('does not read a refused private address for the page', async () => {
    const fetch = vi.fn<ContractFetch>()
    const config = resolveConnectionConfig(
      {},
      { instanceUrl: 'http://10.0.0.5', instanceSha256: 'abc' },
    )
    const blocks = blocksOf(await connectionStatus(config, fetch))
    expect(banner(blocks)?.title).toBe(
      'The Fellowship42 address is a local or private address',
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
