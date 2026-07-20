import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  exitPacketSchema,
  exitPacketVerificationEvidenceSchema,
  importStepKindSchema,
} from '@fellowship42/management-protocol'
import {
  buildExitPacket,
  createExitPacketVerificationEvidence,
  verifyExitPacket,
} from './exit-packet'

const execFileAsync = promisify(execFile)
const operationId = '42424242-1234-4678-9abc-123456789abc'
const instanceId = 'instance_42424242-1234-5678-9abc-123456789abc'
const release = {
  tag: 'v0.6.0',
  applicationVersion: '0.6.0',
  schemaVersion: 5,
  managementProtocolPackageVersion: '0.2.0',
  managementProtocolWireVersion: '1',
  sourceCommit: '4ec2f8b34b4a6b2938b0f3d1d6924daab4587ae1',
  manifestUrl:
    'https://github.com/idea7-cc/fellowship42/releases/download/v0.6.0/release-manifest.json',
  manifestSha256: '3'.repeat(64),
}
const risks = [
  ...Array(5).fill('read-only'),
  ...Array(4).fill('writes-destination'),
  ...Array(3).fill('credential-change'),
  'read-only', 'read-only', 'cutover', 'read-only', 'source-change',
]
const plan = {
  formatVersion: 1,
  operationId,
  generatedAt: '2026-07-19T22:00:00.000Z',
  instanceId,
  exportManifestSha256: 'a'.repeat(64),
  destinationManifestSha256: 'b'.repeat(64),
  sourceRelease: release,
  destinationRelease: release,
  destinationEnvironment: 'production',
  steps: importStepKindSchema.options.map((kind, index) => ({
    id: `import-${String(index + 1).padStart(2, '0')}`,
    kind,
    risk: risks[index],
    resourceName: null,
    dependsOn: index === 0 ? [] : [`import-${String(index).padStart(2, '0')}`],
    approvalRequired: kind === 'cutover-domains' || kind === 'retire-source-routing',
  })),
}
const report = {
  formatVersion: 1,
  operationId,
  instanceId,
  exportManifestSha256: plan.exportManifestSha256,
  destinationManifestSha256: plan.destinationManifestSha256,
  startedAt: '2026-07-19T22:01:00.000Z',
  updatedAt: '2026-07-19T22:31:00.000Z',
  status: 'succeeded',
  steps: importStepKindSchema.options.map((kind, index) => ({
    id: `import-${String(index + 1).padStart(2, '0')}`,
    kind,
    status: 'succeeded',
    code: `${kind}-succeeded`,
    completedAt:
      index < 14 ? '2026-07-19T22:10:00.000Z' : '2026-07-19T22:31:00.000Z',
  })),
}
const approval = {
  formatVersion: 1,
  operationId,
  instanceId,
  exportManifestSha256: plan.exportManifestSha256,
  destinationManifestSha256: plan.destinationManifestSha256,
  approvedAt: '2026-07-19T22:30:00.000Z',
  approvedBy: 'user:operator_42',
  sourceVerifiedAt: '2026-07-19T22:20:00.000Z',
  destinationVerifiedAt: '2026-07-19T22:25:00.000Z',
  credentialDisposition: {
    deployment: 'rotated',
    applicationSecrets: 'rotated',
    management: 'disconnected',
  },
  domains: ['new.example.org'],
  rollbackDeadline: '2026-07-20T22:30:00.000Z',
}
const exportEvidence = {
  formatVersion: 1,
  evidenceId: '42424242-1234-4678-9abc-123456789a90',
  instanceId,
  sourceApplicationVersion: release.applicationVersion,
  sourceSchemaVersion: release.schemaVersion,
  sourceManagementProtocolPackageVersion: release.managementProtocolPackageVersion,
  exportManifestSha256: plan.exportManifestSha256,
  exportedAt: '2026-07-19T21:01:00.000Z',
  verifiedAt: '2026-07-19T22:00:00.000Z',
  consistencyMode: 'operator-quiesced',
  verificationStatus: 'verified',
}
const managementDisposition = {
  formatVersion: 1,
  instanceId,
  state: 'disconnected',
  connectionId: '42424242-1234-4678-9abc-123456789a91',
  operatorId: 'f42-cloud-test',
  disconnectedAt: '2026-07-19T22:29:00.000Z',
  observedAt: '2026-07-19T22:31:00.000Z',
  auditEventId:
    'management-disconnect:42424242-1234-4678-9abc-123456789a91',
  checks: {
    activeConnectionAbsent: true,
    activeGrantsRevoked: true,
    localKeyMaterialRemoved: true,
    replayStateRemoved: true,
    commandStateRemoved: true,
    churchOperationsAvailable: true,
  },
}
const resourceKinds = [
  'd1-database', 'r2-bucket', 'worker', 'outbox-queue',
  'dead-letter-queue', 'durable-object-namespace', 'access-policy', 'domains',
]
const handoff = {
  formatVersion: 1,
  operationId,
  instanceId,
  destinationCustody: {
    infrastructureOwner: 'church',
    infrastructureOwnerSubject: 'organization:new-example-church',
    operatorSubject: 'user:church-admin',
  },
  resources: resourceKinds.map((kind) => ({
    kind,
    destinationState: 'verified',
    sourceDisposition:
      kind === 'domains'
        ? 'routing-retired'
        : kind === 'd1-database' || kind === 'r2-bucket'
          ? 'retained-under-policy'
          : 'access-revoked',
  })),
  domains: [{
    hostname: 'new.example.org',
    destinationRouting: 'active',
    sourceRouting: 'retired',
  }],
  operators: [{
    subject: 'organization:new-example-church',
    role: 'infrastructure-owner',
    disposition: 'church-controlled',
  }],
  credentialAttestation: {
    deployment: 'rotated',
    applicationSecrets: 'rotated',
    management: 'disconnected',
    attestedAt: '2026-07-19T22:31:00.000Z',
  },
  independentOperationVerifiedAt: '2026-07-19T22:31:00.000Z',
  sourceRoutingRetiredAt: '2026-07-19T22:31:00.000Z',
  supportExpiresAt: '2026-08-19T22:31:00.000Z',
  unresolvedRisks: [],
}
const inputs = { plan, report, approval, exportEvidence, managementDisposition, handoff }

describe('hosted exit packets', () => {
  it('binds, verifies, and rejects drift in every public source record', () => {
    const packet = buildExitPacket({
      inputs,
      packetId: '42424242-1234-4678-9abc-123456789a92',
      generatedAt: '2026-07-19T22:32:00.000Z',
    })
    expect(exitPacketSchema.parse(packet)).toEqual(packet)
    expect(packet.checks).toHaveLength(12)
    expect(verifyExitPacket({ packet, inputs })).toEqual(packet)
    const evidence = createExitPacketVerificationEvidence({
      packet,
      inputs,
      evidenceId: '42424242-1234-4678-9abc-123456789a93',
      verifiedAt: '2026-07-19T22:33:00.000Z',
    })
    expect(exitPacketVerificationEvidenceSchema.parse(evidence)).toEqual(evidence)
    expect(() => verifyExitPacket({
      packet: { ...packet, destinationManifestSha256: 'f'.repeat(64) },
      inputs,
    })).toThrow('canonical source evidence')
  })

  it('exposes equivalent build and verification CLI commands', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-exit-packet-'))
    try {
      const paths: Record<string, string> = {}
      for (const [name, value] of Object.entries(inputs)) {
        paths[name] = path.join(root, `${name}.json`)
        await writeFile(paths[name]!, JSON.stringify(value))
      }
      const packetId = '42424242-1234-4678-9abc-123456789a92'
      const generatedAt = '2026-07-19T22:32:00.000Z'
      const common = [
        '--plan', paths.plan!, '--report', paths.report!,
        '--approval', paths.approval!, '--export-evidence', paths.exportEvidence!,
        '--management-disposition', paths.managementDisposition!,
        '--handoff', paths.handoff!,
      ]
      const built = await execFileAsync(process.execPath, [
        path.resolve('dist/cli.js'), 'build-exit-packet', ...common,
        '--packet-id', packetId, '--generated-at', generatedAt,
      ])
      const packet = JSON.parse(built.stdout)
      expect(packet).toEqual(buildExitPacket({ inputs, packetId, generatedAt }))
      const packetPath = path.join(root, 'packet.json')
      await writeFile(packetPath, JSON.stringify(packet))
      const verified = await execFileAsync(process.execPath, [
        path.resolve('dist/cli.js'), 'verify-exit-packet', '--packet', packetPath,
        ...common, '--evidence-id', '42424242-1234-4678-9abc-123456789a93',
        '--verified-at', '2026-07-19T22:33:00.000Z',
      ])
      expect(exitPacketVerificationEvidenceSchema.parse(JSON.parse(verified.stdout)))
        .toMatchObject({ packetId, verificationStatus: 'verified' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
