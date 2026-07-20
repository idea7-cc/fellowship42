import { z } from 'zod'
import {
  deployPlanStepKindSchema,
  portableInstanceIdSchema,
} from './lifecycle.js'
import { sha256DigestSchema } from './releases.js'

const stepIdSchema = z.string().regex(/^step-[0-9]{2}$/)
const machineCodeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
const accountAliasSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/)

export const reconciliationObservationStateSchema = z.enum([
  'absent',
  'matching',
  'drifted',
  'unknown',
])

export const reconciliationOwnershipSchema = z.enum([
  'not-applicable',
  'verified',
  'unverified',
  'foreign',
])

export const reconciliationStepObservationSchema = z
  .object({
    stepId: stepIdSchema,
    kind: deployPlanStepKindSchema,
    state: reconciliationObservationStateSchema,
    ownership: reconciliationOwnershipSchema,
    actualFingerprint: sha256DigestSchema.nullable(),
    code: machineCodeSchema,
  })
  .strict()
  .superRefine((observation, context) => {
    if (
      observation.state === 'absent' &&
      (observation.ownership !== 'not-applicable' ||
        observation.actualFingerprint !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Absent resources cannot have ownership or a fingerprint',
        path: ['state'],
      })
    }
    if (
      ['matching', 'drifted'].includes(observation.state) &&
      observation.actualFingerprint === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Observed resources require a fingerprint',
        path: ['actualFingerprint'],
      })
    }
    if (
      ['unverified', 'foreign'].includes(observation.ownership) &&
      observation.state === 'absent'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Absent resources cannot carry an ownership conflict',
        path: ['ownership'],
      })
    }
  })

function exactOrderedSteps(
  steps: Array<{ stepId: string; kind: string }>,
  context: z.RefinementCtx,
) {
  if (steps.length !== deployPlanStepKindSchema.options.length) {
    context.addIssue({
      code: 'custom',
      message: 'Reconciliation evidence must contain every lifecycle step',
      path: ['steps'],
    })
  }
  for (const [index, step] of steps.entries()) {
    const expectedId = `step-${String(index + 1).padStart(2, '0')}`
    if (step.stepId !== expectedId) {
      context.addIssue({
        code: 'custom',
        message: `Expected ordered reconciliation step ${expectedId}`,
        path: ['steps', index, 'stepId'],
      })
    }
    if (step.kind !== deployPlanStepKindSchema.options[index]) {
      context.addIssue({
        code: 'custom',
        message: 'Reconciliation step kind is out of order',
        path: ['steps', index, 'kind'],
      })
    }
  }
}

export const reconciliationObservationSetSchema = z
  .object({
    formatVersion: z.literal(1),
    manifestSha256: sha256DigestSchema,
    instanceId: portableInstanceIdSchema,
    environment: z.enum(['local', 'staging', 'production']),
    accountAlias: accountAliasSchema,
    observedAt: z.iso.datetime({ offset: true }),
    steps: z.array(reconciliationStepObservationSchema),
  })
  .strict()
  .superRefine((observation, context) =>
    exactOrderedSteps(observation.steps, context),
  )

export const reconciliationActionSchema = z.enum([
  'none',
  'create',
  'update',
  'execute',
  'verify',
  'blocked',
])

export const reconciliationPreviewChangeSchema = z
  .object({
    stepId: stepIdSchema,
    kind: deployPlanStepKindSchema,
    action: reconciliationActionSchema,
    desiredFingerprint: sha256DigestSchema,
    expectedActualFingerprint: sha256DigestSchema.nullable(),
    reasonCode: machineCodeSchema,
    dependsOn: z.array(stepIdSchema),
    destructive: z.literal(false),
  })
  .strict()

export const reconciliationPreviewSchema = z
  .object({
    formatVersion: z.literal(1),
    manifestSha256: sha256DigestSchema,
    instanceId: portableInstanceIdSchema,
    environment: z.enum(['local', 'staging', 'production']),
    accountAlias: accountAliasSchema,
    observedAt: z.iso.datetime({ offset: true }),
    status: z.enum(['ready', 'blocked']),
    changes: z.array(reconciliationPreviewChangeSchema),
  })
  .strict()
  .superRefine((preview, context) => {
    exactOrderedSteps(
      preview.changes.map((change) => ({
        stepId: change.stepId,
        kind: change.kind,
      })),
      context,
    )
    const blocked = preview.changes.some((change) => change.action === 'blocked')
    if ((preview.status === 'blocked') !== blocked) {
      context.addIssue({
        code: 'custom',
        message: 'Preview status must reflect blocked changes',
        path: ['status'],
      })
    }
  })

export const reconciliationApprovalSchema = z
  .object({
    formatVersion: z.literal(1),
    approvalId: z.uuid(),
    previewSha256: sha256DigestSchema,
    manifestSha256: sha256DigestSchema,
    instanceId: portableInstanceIdSchema,
    accountAlias: accountAliasSchema,
    approvedBy: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._:@-]*[A-Za-z0-9])?$/),
    approvedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((approval, context) => {
    const lifetime = Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt)
    if (lifetime <= 0 || lifetime > 60 * 60_000) {
      context.addIssue({
        code: 'custom',
        message: 'Reconciliation approval must expire within one hour',
        path: ['expiresAt'],
      })
    }
  })

export const reconciliationAdapterResultSchema = z
  .object({
    status: z.enum([
      'unchanged',
      'created',
      'updated',
      'executed',
      'verified',
      'failed',
    ]),
    code: machineCodeSchema,
    resultingFingerprint: sha256DigestSchema.nullable(),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      (result.status === 'failed') !== (result.resultingFingerprint === null)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Failed adapter results omit a fingerprint and successful results require one',
        path: ['resultingFingerprint'],
      })
    }
  })

export const reconciliationStepResultSchema = z
  .object({
    stepId: stepIdSchema,
    kind: deployPlanStepKindSchema,
    status: reconciliationAdapterResultSchema.shape.status,
    code: machineCodeSchema,
    resultingFingerprint: sha256DigestSchema.nullable(),
    completedAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const reconciliationReportSchema = z
  .object({
    formatVersion: z.literal(1),
    operationId: z.uuid(),
    idempotencyKeySha256: sha256DigestSchema,
    previewSha256: sha256DigestSchema,
    manifestSha256: sha256DigestSchema,
    instanceId: portableInstanceIdSchema,
    environment: z.enum(['local', 'staging', 'production']),
    accountAlias: accountAliasSchema,
    status: z.enum(['succeeded', 'failed']),
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }),
    steps: z.array(reconciliationStepResultSchema).max(11),
  })
  .strict()
  .superRefine((report, context) => {
    if (Date.parse(report.completedAt) < Date.parse(report.startedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Reconciliation cannot complete before it starts',
        path: ['completedAt'],
      })
    }
    for (const [index, step] of report.steps.entries()) {
      const expectedId = `step-${String(index + 1).padStart(2, '0')}`
      if (
        step.stepId !== expectedId ||
        step.kind !== deployPlanStepKindSchema.options[index]
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Reconciliation results must remain in lifecycle order',
          path: ['steps', index],
        })
      }
      if (
        Date.parse(step.completedAt) < Date.parse(report.startedAt) ||
        Date.parse(step.completedAt) > Date.parse(report.completedAt)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Step completion must fall within the report window',
          path: ['steps', index, 'completedAt'],
        })
      }
    }
    const failed = report.steps.some((step) => step.status === 'failed')
    if ((report.status === 'failed') !== failed) {
      context.addIssue({
        code: 'custom',
        message: 'Report status must reflect a failed step',
        path: ['status'],
      })
    }
    if (
      report.status === 'succeeded' &&
      report.steps.length !== deployPlanStepKindSchema.options.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Successful reconciliation must complete every lifecycle step',
        path: ['steps'],
      })
    }
  })

export type ReconciliationObservationSet = z.output<
  typeof reconciliationObservationSetSchema
>
export type ReconciliationPreview = z.output<typeof reconciliationPreviewSchema>
export type ReconciliationApproval = z.output<typeof reconciliationApprovalSchema>
export type ReconciliationAdapterResult = z.output<
  typeof reconciliationAdapterResultSchema
>
export type ReconciliationReport = z.output<typeof reconciliationReportSchema>
