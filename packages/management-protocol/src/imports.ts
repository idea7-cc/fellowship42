import { z } from 'zod'
import { deploymentReleaseSchema, portableInstanceIdSchema } from './lifecycle.js'
import { sha256DigestSchema } from './releases.js'

export const PORTABLE_IMPORT_FORMAT_VERSION = 1 as const

export const importStepKindSchema = z.enum([
  'verify-export',
  'verify-release-compatibility',
  'verify-destination-manifest',
  'verify-new-empty-d1',
  'verify-new-empty-r2',
  'restore-d1',
  'restore-r2',
  'apply-forward-migrations',
  'deploy-without-domains',
  'rotate-deployment-credentials',
  'rotate-application-secrets',
  'rotate-management-credentials',
  'verify-restored-identity',
  'verify-runtime',
  'cutover-domains',
  'verify-independent-operation',
  'retire-source-routing',
])

export const importStepRiskSchema = z.enum([
  'read-only',
  'writes-destination',
  'credential-change',
  'cutover',
  'source-change',
])

export const importPlanSchema = z
  .object({
    formatVersion: z.literal(PORTABLE_IMPORT_FORMAT_VERSION),
    operationId: z.uuid(),
    generatedAt: z.iso.datetime({ offset: true }),
    instanceId: portableInstanceIdSchema,
    exportManifestSha256: sha256DigestSchema,
    destinationManifestSha256: sha256DigestSchema,
    sourceRelease: deploymentReleaseSchema,
    destinationRelease: deploymentReleaseSchema,
    destinationEnvironment: z.enum(['local', 'staging', 'production']),
    steps: z.array(
      z
        .object({
          id: z.string().regex(/^import-[0-9]{2}$/),
          kind: importStepKindSchema,
          risk: importStepRiskSchema,
          resourceName: z.string().min(1).max(253).nullable(),
          dependsOn: z.array(z.string().regex(/^import-[0-9]{2}$/)),
          approvalRequired: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.steps.length !== importStepKindSchema.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'Import plan must contain every step exactly once',
        path: ['steps'],
      })
    }
    const seen = new Set<string>()
    const expectedRisks = [
      'read-only',
      'read-only',
      'read-only',
      'read-only',
      'read-only',
      'writes-destination',
      'writes-destination',
      'writes-destination',
      'writes-destination',
      'credential-change',
      'credential-change',
      'credential-change',
      'read-only',
      'read-only',
      'cutover',
      'read-only',
      'source-change',
    ] as const
    for (const [position, step] of plan.steps.entries()) {
      const expectedId = `import-${String(position + 1).padStart(2, '0')}`
      if (step.id !== expectedId || step.kind !== importStepKindSchema.options[position]) {
        context.addIssue({
          code: 'custom',
          message: `Expected ordered import step ${expectedId}`,
          path: ['steps', position],
        })
      }
      if (step.risk !== expectedRisks[position]) {
        context.addIssue({
          code: 'custom',
          message: `Import step ${expectedId} has the wrong risk class`,
          path: ['steps', position, 'risk'],
        })
      }
      if (seen.has(step.id)) {
        context.addIssue({ code: 'custom', message: 'Duplicate import step', path: ['steps', position] })
      }
      for (const dependency of step.dependsOn) {
        if (!seen.has(dependency)) {
          context.addIssue({
            code: 'custom',
            message: 'Import dependency must refer to an earlier step',
            path: ['steps', position, 'dependsOn'],
          })
        }
      }
      const cutoverStep = step.kind === 'cutover-domains'
      const sourceStep = step.kind === 'retire-source-routing'
      if (step.approvalRequired !== (cutoverStep || sourceStep)) {
        context.addIssue({
          code: 'custom',
          message: 'Only cutover and source-routing changes require explicit approval',
          path: ['steps', position, 'approvalRequired'],
        })
      }
      seen.add(step.id)
    }
    if (JSON.stringify(plan.sourceRelease) !== JSON.stringify(plan.destinationRelease)) {
      context.addIssue({
        code: 'custom',
        message: 'Import format v1 requires an exact source and destination release match',
        path: ['destinationRelease'],
      })
    }
  })

export type ImportPlan = z.output<typeof importPlanSchema>

const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
  )

export const cutoverApprovalSchema = z
  .object({
    formatVersion: z.literal(PORTABLE_IMPORT_FORMAT_VERSION),
    operationId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    exportManifestSha256: sha256DigestSchema,
    destinationManifestSha256: sha256DigestSchema,
    approvedAt: z.iso.datetime({ offset: true }),
    approvedBy: z
      .string()
      .min(3)
      .max(128)
      .regex(/^(?:user|service|workflow):[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    sourceVerifiedAt: z.iso.datetime({ offset: true }),
    destinationVerifiedAt: z.iso.datetime({ offset: true }),
    credentialDisposition: z
      .object({
        deployment: z.literal('rotated'),
        applicationSecrets: z.literal('rotated'),
        management: z.enum(['rotated', 'disconnected']),
      })
      .strict(),
    domains: z.array(hostnameSchema).min(1).max(8),
    rollbackDeadline: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((approval, context) => {
    if (
      Date.parse(approval.destinationVerifiedAt) > Date.parse(approval.approvedAt) ||
      Date.parse(approval.sourceVerifiedAt) > Date.parse(approval.approvedAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Cutover approval must follow both runtime verifications',
        path: ['approvedAt'],
      })
    }
    if (Date.parse(approval.rollbackDeadline) <= Date.parse(approval.approvedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Rollback deadline must follow approval',
        path: ['rollbackDeadline'],
      })
    }
    if (new Set(approval.domains).size !== approval.domains.length) {
      context.addIssue({ code: 'custom', message: 'Cutover domains must be unique', path: ['domains'] })
    }
  })

export type CutoverApproval = z.output<typeof cutoverApprovalSchema>

export const destinationImportPreflightSchema = z
  .object({
    formatVersion: z.literal(PORTABLE_IMPORT_FORMAT_VERSION),
    operationId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    destinationManifestSha256: sha256DigestSchema,
    observedAt: z.iso.datetime({ offset: true }),
    d1: z
      .object({ state: z.literal('empty'), createdAt: z.iso.datetime({ offset: true }) })
      .strict(),
    r2: z
      .object({ state: z.literal('empty'), createdAt: z.iso.datetime({ offset: true }) })
      .strict(),
    worker: z.literal('absent'),
    outboxQueue: z.literal('absent'),
    deadLetterQueue: z.literal('absent'),
    durableObjectNamespace: z.literal('absent'),
  })
  .strict()

export type DestinationImportPreflight = z.output<
  typeof destinationImportPreflightSchema
>

const importStepResultSchema = z
  .object({
    id: z.string().regex(/^import-[0-9]{2}$/),
    kind: importStepKindSchema,
    status: z.enum(['pending', 'succeeded', 'failed']),
    code: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()

export const importExecutionReportSchema = z
  .object({
    formatVersion: z.literal(PORTABLE_IMPORT_FORMAT_VERSION),
    operationId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    exportManifestSha256: sha256DigestSchema,
    destinationManifestSha256: sha256DigestSchema,
    startedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    status: z.enum(['awaiting-cutover', 'succeeded', 'failed']),
    steps: z.array(importStepResultSchema),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.steps.length !== importStepKindSchema.options.length) {
      context.addIssue({ code: 'custom', message: 'Execution report must include every import step', path: ['steps'] })
      return
    }
    let failureSeen = false
    let pendingSeen = false
    for (const [position, step] of report.steps.entries()) {
      const expectedId = `import-${String(position + 1).padStart(2, '0')}`
      if (step.id !== expectedId || step.kind !== importStepKindSchema.options[position]) {
        context.addIssue({ code: 'custom', message: `Expected execution step ${expectedId}`, path: ['steps', position] })
      }
      if ((step.status === 'pending') !== (step.completedAt === null)) {
        context.addIssue({ code: 'custom', message: 'Only pending steps omit completion time', path: ['steps', position] })
      }
      if (failureSeen && step.status !== 'pending') {
        context.addIssue({ code: 'custom', message: 'No step may run after a failed step', path: ['steps', position] })
      }
      if (pendingSeen && step.status !== 'pending') {
        context.addIssue({ code: 'custom', message: 'No step may run after a pending step', path: ['steps', position] })
      }
      if (
        step.completedAt !== null &&
        (Date.parse(step.completedAt) < Date.parse(report.startedAt) ||
          Date.parse(step.completedAt) > Date.parse(report.updatedAt))
      ) {
        context.addIssue({ code: 'custom', message: 'Step completion is outside the report window', path: ['steps', position, 'completedAt'] })
      }
      if (step.status === 'failed') failureSeen = true
      if (step.status === 'pending') pendingSeen = true
    }
    const failed = report.steps.some((step) => step.status === 'failed')
    const complete = report.steps.every((step) => step.status === 'succeeded')
    const awaiting = report.steps.every((step, position) =>
      position < 14 ? step.status === 'succeeded' : step.status === 'pending',
    )
    const expectedStatus = failed
      ? 'failed'
      : complete
        ? 'succeeded'
        : awaiting
          ? 'awaiting-cutover'
          : null
    if (report.status !== expectedStatus) {
      context.addIssue({ code: 'custom', message: 'Execution status does not match step results', path: ['status'] })
    }
    if (Date.parse(report.updatedAt) < Date.parse(report.startedAt)) {
      context.addIssue({ code: 'custom', message: 'Execution update cannot precede start', path: ['updatedAt'] })
    }
  })

export type ImportExecutionReport = z.output<typeof importExecutionReportSchema>
