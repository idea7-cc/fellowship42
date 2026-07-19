import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  INSTANCE_TOPOLOGY,
  MANAGEMENT_PROTOCOL_VERSION,
  instanceDescriptorSchema,
  managementCommandSchema,
  releaseManifestSchema,
} from './index'

describe('management protocol contracts', () => {
  it('describes a church-owned instance operated by a partner', () => {
    const result = instanceDescriptorSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      instanceId: 'instance_demo',
      topology: INSTANCE_TOPOLOGY,
      applicationVersion: '0.1.0',
      schemaVersion: 2,
      infrastructure: { owner: 'church', operator: 'partner' },
      capabilities: ['instance.status.read', 'backup.export'],
    })

    expect(result.infrastructure).toEqual({ owner: 'church', operator: 'partner' })
  })

  it('rejects commands without replay-protection metadata', () => {
    const result = managementCommandSchema.safeParse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: crypto.randomUUID(),
      instanceId: 'instance_demo',
      capability: 'update.apply',
    })

    expect(result.success).toBe(false)
  })

  it('accepts a bounded, replay-protected command envelope', () => {
    const command = managementCommandSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: crypto.randomUUID(),
      instanceId: 'instance_demo',
      issuedAt: '2026-07-18T16:00:00.000Z',
      expiresAt: '2026-07-18T16:05:00.000Z',
      nonce: '0123456789abcdef',
      capability: 'instance.status.read',
    })

    expect(command.input).toEqual({})
  })

  it('accepts the immutable v0.1.0 release-manifest fixture', async () => {
    const fixture = JSON.parse(
      await readFile(new URL('../fixtures/release-manifest.v1.json', import.meta.url), 'utf8'),
    )

    const manifest = releaseManifestSchema.parse(fixture)

    expect(manifest.source.commit).toBe('1d2ad29942a4a72c00ab982ce621f9573aba5560')
    expect(manifest.artifacts).toHaveLength(2)
  })

  it('rejects a release manifest with a malformed checksum', async () => {
    const fixture = JSON.parse(
      await readFile(new URL('../fixtures/release-manifest.v1.json', import.meta.url), 'utf8'),
    )
    fixture.artifacts[0].sha256 = 'not-a-checksum'

    expect(releaseManifestSchema.safeParse(fixture).success).toBe(false)
  })
})
