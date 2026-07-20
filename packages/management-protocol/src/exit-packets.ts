import { z } from 'zod'
import { exportEvidenceSchema } from './exports.js'
import { cutoverApprovalSchema, importExecutionReportSchema, importPlanSchema } from './imports.js'
import { deploymentReleaseSchema, portableInstanceIdSchema } from './lifecycle.js'
import { sha256DigestSchema } from './releases.js'

export const EXIT_PACKET_FORMAT_VERSION = 1 as const

const boundedCodeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
const subjectSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^(?:organization|user|service):[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)

export const managementExitDispositionSchema = z
  .object({
    formatVersion: z.literal(EXIT_PACKET_FORMAT_VERSION),
    instanceId: portableInstanceIdSchema,
    state: z.literal('disconnected'),
    connectionId: z.uuid(),
    operatorId: z.string().min(1).max(128),
    disconnectedAt: z.iso.datetime({ offset: true }),
    observedAt: z.iso.datetime({ offset: true }),
    auditEventId: z.string().regex(/^management-disconnect:[0-9a-f-]{36}$/),
    checks: z
      .object({
        activeConnectionAbsent: z.literal(true),
        activeGrantsRevoked: z.literal(true),
        localKeyMaterialRemoved: z.literal(true),
        replayStateRemoved: z.literal(true),
        commandStateRemoved: z.literal(true),
        churchOperationsAvailable: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((disposition, context) => {
    if (Date.parse(disposition.observedAt) < Date.parse(disposition.disconnectedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Management disposition observation predates disconnection',
        path: ['observedAt'],
      })
    }
    if (disposition.auditEventId !== `management-disconnect:${disposition.connectionId}`) {
      context.addIssue({
        code: 'custom',
        message: 'Management disposition audit event does not match connection',
        path: ['auditEventId'],
      })
    }
  })

export type ManagementExitDisposition = z.output<typeof managementExitDispositionSchema>

export const exitResourceKindSchema = z.enum([
  'd1-database',
  'r2-bucket',
  'worker',
  'outbox-queue',
  'dead-letter-queue',
  'durable-object-namespace',
  'access-policy',
  'domains',
])

const destinationCustodySchema = z
  .object({
    infrastructureOwner: z.literal('church'),
    infrastructureOwnerSubject: subjectSchema,
    operatorSubject: subjectSchema.nullable(),
  })
  .strict()

const exitResourceSchema = z
  .object({
    kind: exitResourceKindSchema,
    destinationState: z.literal('verified'),
    sourceDisposition: z.enum(['retained-under-policy', 'routing-retired', 'access-revoked', 'not-applicable']),
  })
  .strict()

const exitDomainSchema = z
  .object({
    hostname: hostnameSchema,
    destinationRouting: z.literal('active'),
    sourceRouting: z.literal('retired'),
  })
  .strict()

const exitOperatorSchema = z
  .object({
    subject: subjectSchema,
    role: z.enum(['infrastructure-owner', 'instance-operator', 'support']),
    disposition: z.enum(['church-controlled', 'partner-authorized', 'revoked', 'expired']),
  })
  .strict()

const exitCredentialAttestationSchema = z
  .object({
    deployment: z.literal('rotated'),
    applicationSecrets: z.literal('rotated'),
    management: z.literal('disconnected'),
    attestedAt: z.iso.datetime({ offset: true }),
  })
  .strict()

const unresolvedExitRiskSchema = z
  .object({
    code: boundedCodeSchema,
    severity: z.enum(['low', 'medium', 'high']),
    disposition: z.enum(['accepted', 'mitigating']),
    ownerSubject: subjectSchema,
  })
  .strict()

export const exitHandoffSchema = z
  .object({
    formatVersion: z.literal(EXIT_PACKET_FORMAT_VERSION),
    operationId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    destinationCustody: destinationCustodySchema,
    resources: z.array(exitResourceSchema),
    domains: z.array(exitDomainSchema).min(1).max(8),
    operators: z.array(exitOperatorSchema).min(1).max(25),
    credentialAttestation: exitCredentialAttestationSchema,
    independentOperationVerifiedAt: z.iso.datetime({ offset: true }),
    sourceRoutingRetiredAt: z.iso.datetime({ offset: true }),
    supportExpiresAt: z.iso.datetime({ offset: true }),
    unresolvedRisks: z.array(unresolvedExitRiskSchema).max(20),
  })
  .strict()
  .superRefine((handoff, context) => {
    for (const [index, kind] of exitResourceKindSchema.options.entries()) {
      if (handoff.resources[index]?.kind !== kind) {
        context.addIssue({
          code: 'custom',
          message: `Expected ordered exit resource ${kind}`,
          path: ['resources', index, 'kind'],
        })
      }
    }
    if (handoff.resources.length !== exitResourceKindSchema.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'Exit handoff must cover every resource class exactly once',
        path: ['resources'],
      })
    }
    if (handoff.resources.at(-1)?.sourceDisposition !== 'routing-retired') {
      context.addIssue({
        code: 'custom',
        message: 'Domain source routing must be retired',
        path: ['resources', exitResourceKindSchema.options.length - 1],
      })
    }
    if (new Set(handoff.domains.map((domain) => domain.hostname)).size !== handoff.domains.length) {
      context.addIssue({
        code: 'custom',
        message: 'Exit handoff domains must be unique',
        path: ['domains'],
      })
    }
    const operatorKeys = handoff.operators.map((operator) => `${operator.subject}:${operator.role}`)
    if (new Set(operatorKeys).size !== operatorKeys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Exit handoff operator roles must be unique',
        path: ['operators'],
      })
    }
    if (
      !handoff.operators.some(
        (operator) =>
          operator.subject === handoff.destinationCustody.infrastructureOwnerSubject &&
          operator.role === 'infrastructure-owner' &&
          operator.disposition === 'church-controlled',
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Church-controlled infrastructure owner is missing',
        path: ['operators'],
      })
    }
  })

export type ExitHandoff = z.output<typeof exitHandoffSchema>

export const exitPacketCheckIdSchema = z.enum([
  'export-verified',
  'destination-restored',
  'credentials-rotated',
  'portable-identity-preserved',
  'runtime-healthy',
  'cutover-approved',
  'domain-routing-active',
  'independent-operation-verified',
  'source-routing-retired',
  'management-disconnected',
  'church-custody-recorded',
  'support-and-risks-disclosed',
])

export const exitPacketSchema = z
  .object({
    formatVersion: z.literal(EXIT_PACKET_FORMAT_VERSION),
    packetId: z.uuid(),
    generatedAt: z.iso.datetime({ offset: true }),
    scenario: z.literal('hosted-to-church-owned'),
    operationId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    release: deploymentReleaseSchema,
    export: exportEvidenceSchema,
    destinationManifestSha256: sha256DigestSchema,
    evidenceDigests: z
      .object({
        planSha256: sha256DigestSchema,
        executionReportSha256: sha256DigestSchema,
        cutoverApprovalSha256: sha256DigestSchema,
        exportEvidenceSha256: sha256DigestSchema,
        managementDispositionSha256: sha256DigestSchema,
        handoffSha256: sha256DigestSchema,
      })
      .strict(),
    managementDisposition: managementExitDispositionSchema,
    destinationCustody: destinationCustodySchema,
    resources: z.array(exitResourceSchema),
    domains: z.array(exitDomainSchema).min(1).max(8),
    operators: z.array(exitOperatorSchema).min(1).max(25),
    credentialAttestation: exitCredentialAttestationSchema,
    independentOperationVerifiedAt: z.iso.datetime({ offset: true }),
    sourceRoutingRetiredAt: z.iso.datetime({ offset: true }),
    supportExpiresAt: z.iso.datetime({ offset: true }),
    unresolvedRisks: z.array(unresolvedExitRiskSchema).max(20),
    checks: z
      .array(
        z
          .object({
            id: exitPacketCheckIdSchema,
            status: z.literal('pass'),
            code: boundedCodeSchema,
          })
          .strict(),
      )
      .length(exitPacketCheckIdSchema.options.length),
  })
  .strict()
  .superRefine((packet, context) => {
    for (const [index, id] of exitPacketCheckIdSchema.options.entries()) {
      if (packet.checks[index]?.id !== id) {
        context.addIssue({
          code: 'custom',
          message: `Expected ordered exit check ${id}`,
          path: ['checks', index, 'id'],
        })
      }
    }
    for (const [index, kind] of exitResourceKindSchema.options.entries()) {
      if (packet.resources[index]?.kind !== kind) {
        context.addIssue({
          code: 'custom',
          message: `Expected ordered exit resource ${kind}`,
          path: ['resources', index, 'kind'],
        })
      }
    }
    if (packet.resources.length !== exitResourceKindSchema.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'Exit packet must cover every resource class exactly once',
        path: ['resources'],
      })
    }
    if (packet.resources.at(-1)?.sourceDisposition !== 'routing-retired') {
      context.addIssue({
        code: 'custom',
        message: 'Exit packet must record retired source domain routing',
        path: ['resources', exitResourceKindSchema.options.length - 1],
      })
    }
    if (new Set(packet.domains.map((domain) => domain.hostname)).size !== packet.domains.length) {
      context.addIssue({
        code: 'custom',
        message: 'Exit packet domains must be unique',
        path: ['domains'],
      })
    }
    if (
      !packet.operators.some(
        (operator) =>
          operator.subject === packet.destinationCustody.infrastructureOwnerSubject &&
          operator.role === 'infrastructure-owner' &&
          operator.disposition === 'church-controlled',
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Exit packet is missing its church-controlled owner',
        path: ['operators'],
      })
    }
    if (
      packet.export.instanceId !== packet.instanceId ||
      packet.managementDisposition.instanceId !== packet.instanceId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Exit packet evidence must share one portable identity',
        path: ['instanceId'],
      })
    }
    if (
      Date.parse(packet.generatedAt) <
      Math.max(
        Date.parse(packet.export.verifiedAt),
        Date.parse(packet.managementDisposition.observedAt),
        Date.parse(packet.independentOperationVerifiedAt),
        Date.parse(packet.sourceRoutingRetiredAt),
        Date.parse(packet.credentialAttestation.attestedAt),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Exit packet was generated before its evidence was complete',
        path: ['generatedAt'],
      })
    }
  })

export type ExitPacket = z.output<typeof exitPacketSchema>

export const exitPacketVerificationEvidenceSchema = z
  .object({
    formatVersion: z.literal(EXIT_PACKET_FORMAT_VERSION),
    evidenceId: z.uuid(),
    packetId: z.uuid(),
    operationId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    packetSha256: sha256DigestSchema,
    verifiedAt: z.iso.datetime({ offset: true }),
    verificationStatus: z.literal('verified'),
  })
  .strict()

export type ExitPacketVerificationEvidence = z.output<typeof exitPacketVerificationEvidenceSchema>

export const exitPacketBuildInputsSchema = z
  .object({
    plan: importPlanSchema,
    report: importExecutionReportSchema,
    approval: cutoverApprovalSchema,
    exportEvidence: exportEvidenceSchema,
    managementDisposition: managementExitDispositionSchema,
    handoff: exitHandoffSchema,
  })
  .strict()

export type ExitPacketBuildInputs = z.output<typeof exitPacketBuildInputsSchema>
