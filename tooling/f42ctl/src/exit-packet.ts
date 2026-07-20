import { createHash, randomUUID } from 'node:crypto'
import {
  exitPacketBuildInputsSchema,
  exitPacketCheckIdSchema,
  exitPacketSchema,
  exitPacketVerificationEvidenceSchema,
  type ExitPacket,
  type ExitPacketBuildInputs,
  type ExitPacketVerificationEvidence,
} from '@fellowship42/management-protocol'
import { canonicalJson } from './canonical.js'

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function requireEqual(actual: unknown, expected: unknown, message: string) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(message)
}

function validateBindings(inputs: ExitPacketBuildInputs) {
  const { plan, report, approval, exportEvidence, managementDisposition, handoff } = inputs
  if (report.status !== 'succeeded' || report.steps.some((step) => step.status !== 'succeeded')) {
    throw new Error('Exit packet requires a fully succeeded portable import')
  }
  for (const evidence of [report, approval, handoff]) {
    if (evidence.operationId !== plan.operationId || evidence.instanceId !== plan.instanceId) {
      throw new Error('Exit packet evidence does not share one operation and instance')
    }
  }
  if (exportEvidence.instanceId !== plan.instanceId || managementDisposition.instanceId !== plan.instanceId) {
    throw new Error('Exit packet evidence does not preserve the portable instance identity')
  }
  for (const evidence of [report, approval]) {
    if (
      evidence.exportManifestSha256 !== plan.exportManifestSha256 ||
      evidence.destinationManifestSha256 !== plan.destinationManifestSha256
    ) {
      throw new Error('Exit packet evidence does not bind to the import plan manifests')
    }
  }
  if (exportEvidence.exportManifestSha256 !== plan.exportManifestSha256) {
    throw new Error('Export evidence does not bind to the imported export manifest')
  }
  if (
    exportEvidence.sourceApplicationVersion !== plan.sourceRelease.applicationVersion ||
    exportEvidence.sourceSchemaVersion !== plan.sourceRelease.schemaVersion ||
    exportEvidence.sourceManagementProtocolPackageVersion !== plan.sourceRelease.managementProtocolPackageVersion
  ) {
    throw new Error('Export evidence release does not match the portable import source')
  }
  if (approval.credentialDisposition.management !== 'disconnected') {
    throw new Error('Hosted exit requires locally verified management disconnection')
  }
  requireEqual(
    handoff.domains.map((domain) => domain.hostname),
    approval.domains,
    'Handoff domains do not match the approved cutover domains',
  )
  if (Date.parse(handoff.credentialAttestation.attestedAt) < Date.parse(approval.approvedAt)) {
    throw new Error('Credential attestation predates cutover approval')
  }
  const independentStep = report.steps[15]
  const sourceRetirementStep = report.steps[16]
  if (
    independentStep?.kind !== 'verify-independent-operation' ||
    independentStep.completedAt !== handoff.independentOperationVerifiedAt ||
    sourceRetirementStep?.kind !== 'retire-source-routing' ||
    sourceRetirementStep.completedAt !== handoff.sourceRoutingRetiredAt
  ) {
    throw new Error('Handoff timestamps do not match the completed cutover report')
  }
}

export function buildExitPacket(options: { inputs: unknown; packetId?: string; generatedAt?: string }): ExitPacket {
  const inputs = exitPacketBuildInputsSchema.parse(options.inputs)
  validateBindings(inputs)
  const generatedAt = new Date(options.generatedAt ?? new Date().toISOString())
  const latestEvidenceTime = Math.max(
    Date.parse(inputs.report.updatedAt),
    Date.parse(inputs.approval.approvedAt),
    Date.parse(inputs.exportEvidence.verifiedAt),
    Date.parse(inputs.managementDisposition.observedAt),
    Date.parse(inputs.handoff.credentialAttestation.attestedAt),
    Date.parse(inputs.handoff.sourceRoutingRetiredAt),
  )
  if (Number.isNaN(generatedAt.valueOf()) || generatedAt.valueOf() < latestEvidenceTime) {
    throw new Error('Exit packet generation must follow all supplied evidence')
  }
  const { plan, report, approval, exportEvidence, managementDisposition, handoff } = inputs
  const checkCodes = [
    'portable-export-verified',
    'portable-restore-succeeded',
    'destination-credentials-rotated',
    'portable-instance-id-preserved',
    'destination-runtime-verified',
    'cutover-explicitly-approved',
    'destination-domains-active',
    'independent-operation-verified',
    'source-routing-retired',
    'local-management-disconnected',
    'church-infrastructure-custody',
    'support-and-risk-disclosure-complete',
  ] as const
  return exitPacketSchema.parse({
    formatVersion: 1,
    packetId: options.packetId ?? randomUUID(),
    generatedAt: generatedAt.toISOString(),
    scenario: 'hosted-to-church-owned',
    operationId: plan.operationId,
    instanceId: plan.instanceId,
    release: plan.destinationRelease,
    export: exportEvidence,
    destinationManifestSha256: plan.destinationManifestSha256,
    evidenceDigests: {
      planSha256: sha256Canonical(plan),
      executionReportSha256: sha256Canonical(report),
      cutoverApprovalSha256: sha256Canonical(approval),
      exportEvidenceSha256: sha256Canonical(exportEvidence),
      managementDispositionSha256: sha256Canonical(managementDisposition),
      handoffSha256: sha256Canonical(handoff),
    },
    managementDisposition,
    destinationCustody: handoff.destinationCustody,
    resources: handoff.resources,
    domains: handoff.domains,
    operators: handoff.operators,
    credentialAttestation: handoff.credentialAttestation,
    independentOperationVerifiedAt: handoff.independentOperationVerifiedAt,
    sourceRoutingRetiredAt: handoff.sourceRoutingRetiredAt,
    supportExpiresAt: handoff.supportExpiresAt,
    unresolvedRisks: handoff.unresolvedRisks,
    checks: exitPacketCheckIdSchema.options.map((id, index) => ({
      id,
      status: 'pass',
      code: checkCodes[index],
    })),
  })
}

export function verifyExitPacket(options: { packet: unknown; inputs: unknown }): ExitPacket {
  const packet = exitPacketSchema.parse(options.packet)
  const rebuilt = buildExitPacket({
    inputs: options.inputs,
    packetId: packet.packetId,
    generatedAt: packet.generatedAt,
  })
  requireEqual(packet, rebuilt, 'Exit packet does not match its canonical source evidence')
  return packet
}

export function createExitPacketVerificationEvidence(options: {
  packet: unknown
  inputs: unknown
  evidenceId?: string
  verifiedAt?: string
}): ExitPacketVerificationEvidence {
  const packet = verifyExitPacket(options)
  const verifiedAt = new Date(options.verifiedAt ?? new Date().toISOString())
  if (Number.isNaN(verifiedAt.valueOf()) || verifiedAt.valueOf() < Date.parse(packet.generatedAt)) {
    throw new Error('Exit packet verification cannot predate packet generation')
  }
  return exitPacketVerificationEvidenceSchema.parse({
    formatVersion: 1,
    evidenceId: options.evidenceId ?? randomUUID(),
    packetId: packet.packetId,
    operationId: packet.operationId,
    instanceId: packet.instanceId,
    packetSha256: sha256Canonical(packet),
    verifiedAt: verifiedAt.toISOString(),
    verificationStatus: 'verified',
  })
}
