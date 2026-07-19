import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  INSTANCE_TOPOLOGY,
  MANAGEMENT_PROTOCOL_VERSION,
  instanceDescriptorSchema,
  managementCommandSchema,
  deploymentManifestSchema,
  doctorCheckIdSchema,
  doctorReportSchema,
  exportEvidenceSchema,
  portableConfigurationSchema,
  portableExportManifestSchema,
  r2ExportIndexSchema,
  releaseManifestSchema,
} from './index'

const deploymentManifest = {
  formatVersion: 1,
  instance: {
    id: 'instance_42424242-1234-5678-9abc-123456789abc',
    topology: 'single-church',
    release: {
      tag: 'v0.6.0',
      applicationVersion: '0.6.0',
      schemaVersion: 5,
      managementProtocolPackageVersion: '0.2.0',
      managementProtocolWireVersion: '1',
      sourceCommit: '4ec2f8b34b4a6b2938b0f3d1d6924daab4587ae1',
      manifestUrl:
        'https://github.com/idea7-cc/fellowship42/releases/download/v0.6.0/release-manifest.json',
      manifestSha256:
        '3609a466938e4df3980eb2600087f774a817afd5f2bf008e07042e40ae3aebb2',
    },
  },
  custody: { infrastructureOwner: 'church', operator: 'church' },
  target: { environment: 'local', accountAlias: 'local-development' },
  worker: { name: 'fellowship42', domains: [] },
  resources: {
    d1: { binding: 'DB', name: 'fellowship42' },
    r2: { binding: 'MEDIA', name: 'fellowship42-media' },
    outboxQueue: {
      binding: 'OUTBOX_QUEUE',
      name: 'fellowship42-outbox',
      deadLetterName: 'fellowship42-outbox-dlq',
    },
    durableObject: { binding: 'CHURCH_ROOMS', className: 'ChurchRoom' },
    schedules: ['*/1 * * * *'],
  },
  configuration: {
    accessTeamDomain: null,
    accessAudienceConfigured: false,
    paymentWebhookProvider: null,
  },
} as const

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

    expect(result.infrastructure).toEqual({
      owner: 'church',
      operator: 'partner',
    })
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
      await readFile(
        new URL('../fixtures/release-manifest.v1.json', import.meta.url),
        'utf8',
      ),
    )

    const manifest = releaseManifestSchema.parse(fixture)

    expect(manifest.source.commit).toBe(
      '1d2ad29942a4a72c00ab982ce621f9573aba5560',
    )
    expect(manifest.artifacts).toHaveLength(2)
  })

  it('rejects a release manifest with a malformed checksum', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL('../fixtures/release-manifest.v1.json', import.meta.url),
        'utf8',
      ),
    )
    fixture.artifacts[0].sha256 = 'not-a-checksum'

    expect(releaseManifestSchema.safeParse(fixture).success).toBe(false)
  })

  it('accepts a portable deployment manifest without provider identifiers', () => {
    const parsed = deploymentManifestSchema.parse(deploymentManifest)

    expect(parsed.instance.release.sourceCommit).toHaveLength(40)
    expect(JSON.stringify(parsed)).not.toContain('accountId')
  })

  it('requires production identity configuration and exact release coordinates', () => {
    const production = {
      ...deploymentManifest,
      target: { ...deploymentManifest.target, environment: 'production' },
    }
    const wrongCommit = {
      ...deploymentManifest,
      instance: {
        ...deploymentManifest.instance,
        release: {
          ...deploymentManifest.instance.release,
          sourceCommit: 'main',
        },
      },
    }

    expect(deploymentManifestSchema.safeParse(production).success).toBe(false)
    expect(deploymentManifestSchema.safeParse(wrongCommit).success).toBe(false)
  })

  it('derives doctor health from bounded check statuses', () => {
    const report = {
      formatVersion: 1,
      checkedAt: '2026-07-19T19:30:00.000Z',
      manifestSha256: deploymentManifest.instance.release.manifestSha256,
      instanceId: deploymentManifest.instance.id,
      release: deploymentManifest.instance.release,
      status: 'healthy',
      checks: doctorCheckIdSchema.options.map((id) => ({
        id,
        status: 'pass',
        code: `${id}-verified`,
      })),
    }

    expect(doctorReportSchema.parse(report).status).toBe('healthy')
    expect(
      doctorReportSchema.safeParse({
        ...report,
        checks: report.checks.slice(0, -1),
      }).success,
    ).toBe(false)
    expect(
      doctorReportSchema.safeParse({
        ...report,
        status: 'healthy',
        checks: report.checks.map((check) =>
          check.id === 'release-manifest'
            ? { ...check, status: 'fail', code: 'digest-mismatch' }
            : check,
        ),
      }).success,
    ).toBe(false)
  })

  it('binds a portable export to identity, release, quiescence, and fixed artifacts', () => {
    const exported = portableExportManifestSchema.parse({
      formatVersion: 1,
      instanceId: deploymentManifest.instance.id,
      sourceRelease: deploymentManifest.instance.release,
      exportedAt: '2026-07-19T21:01:00.000Z',
      consistency: {
        mode: 'operator-quiesced',
        quiescedAt: '2026-07-19T21:00:00.000Z',
      },
      artifacts: [
        { kind: 'd1-sql', file: 'd1/database.sql', bytes: 42, sha256: 'a'.repeat(64) },
        {
          kind: 'portable-configuration',
          file: 'config/portable.json',
          bytes: 42,
          sha256: 'b'.repeat(64),
        },
        { kind: 'r2-index', file: 'r2/index.json', bytes: 42, sha256: 'c'.repeat(64) },
      ],
    })

    expect(exported.instanceId).toBe(deploymentManifest.instance.id)
    expect(
      portableExportManifestSchema.safeParse({
        ...exported,
        consistency: { ...exported.consistency, quiescedAt: '2026-07-19T22:00:00.000Z' },
      }).success,
    ).toBe(false)
  })

  it('keeps portable configuration and private export evidence payload-free', () => {
    const configuration = portableConfigurationSchema.parse({
      formatVersion: 1,
      instanceId: deploymentManifest.instance.id,
      settings: { paymentWebhookProvider: 'stripe' },
    })
    const evidence = exportEvidenceSchema.parse({
      formatVersion: 1,
      evidenceId: '42424242-1234-4678-9abc-123456789abc',
      instanceId: deploymentManifest.instance.id,
      sourceApplicationVersion: '0.7.2',
      sourceSchemaVersion: 5,
      sourceManagementProtocolPackageVersion: '0.4.0',
      exportManifestSha256: 'd'.repeat(64),
      exportedAt: '2026-07-19T21:01:00.000Z',
      verifiedAt: '2026-07-19T21:02:00.000Z',
      consistencyMode: 'operator-quiesced',
      verificationStatus: 'verified',
    })

    expect(Object.keys(configuration.settings)).toEqual(['paymentWebhookProvider'])
    expect(JSON.stringify(evidence)).not.toContain('objectKey')
  })

  it('requires unique R2 keys and content-addressed object paths', () => {
    const object = {
      key: 'sermons/week-1.mp3',
      file: `r2/objects/${'e'.repeat(64)}`,
      bytes: 10,
      sha256: 'e'.repeat(64),
    }
    expect(r2ExportIndexSchema.parse({ formatVersion: 1, objects: [object] }).objects).toHaveLength(1)
    expect(
      r2ExportIndexSchema.safeParse({ formatVersion: 1, objects: [object, object] }).success,
    ).toBe(false)
    expect(
      r2ExportIndexSchema.safeParse({
        formatVersion: 1,
        objects: [{ ...object, file: '../payload' }],
      }).success,
    ).toBe(false)
  })
})
