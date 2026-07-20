import { z } from 'zod'
import { portableInstanceIdSchema } from './lifecycle.js'
import {
  releaseUpgradeEvidenceIdSchema,
  releaseUpgradeSourceSchema,
  semanticVersionSchema,
  sha256DigestSchema,
} from './releases.js'

export const UPDATE_EVIDENCE_FORMAT_VERSION = 1 as const

export const updateTargetSchema = z
  .object({
    releaseTag: z.string().regex(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    releaseManifestSha256: sha256DigestSchema,
    applicationVersion: semanticVersionSchema,
    schemaVersion: z.number().int().nonnegative(),
    managementProtocolWireVersion: z.string().regex(/^\d+$/),
  })
  .strict()
  .superRefine((target, context) => {
    if (target.releaseTag !== `v${target.applicationVersion}`) {
      context.addIssue({
        code: 'custom',
        message: 'Update target tag must match its application version',
        path: ['releaseTag'],
      })
    }
  })

export const updatePreparationStateSchema = z.enum([
  'awaiting-local-approval',
  'approved',
  'authorized',
  'applied',
  'expired',
  'superseded',
])

const updateLocalApprovalSchema = z
  .object({
    localApprovalId: z.uuid(),
    approvedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    consumedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((approval, context) => {
    const lifetime = Date.parse(approval.expiresAt) - Date.parse(approval.approvedAt)
    if (lifetime <= 0 || lifetime > 30 * 60_000) {
      context.addIssue({
        code: 'custom',
        message: 'Local update approval must expire within 30 minutes',
        path: ['expiresAt'],
      })
    }
    if (
      approval.consumedAt &&
      (Date.parse(approval.consumedAt) < Date.parse(approval.approvedAt) ||
        Date.parse(approval.consumedAt) > Date.parse(approval.expiresAt))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Local update approval consumption must occur during its validity window',
        path: ['consumedAt'],
      })
    }
  })

const updateAuthorizationSummarySchema = z
  .object({
    authorizationId: z.uuid(),
    authorizedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((authorization, context) => {
    const lifetime =
      Date.parse(authorization.expiresAt) - Date.parse(authorization.authorizedAt)
    if (lifetime <= 0 || lifetime > 60 * 60_000) {
      context.addIssue({
        code: 'custom',
        message: 'Update authorization must expire within one hour',
        path: ['expiresAt'],
      })
    }
  })

export const updatePreparationSchema = z
  .object({
    formatVersion: z.literal(UPDATE_EVIDENCE_FORMAT_VERSION),
    preparationId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    source: releaseUpgradeSourceSchema,
    target: updateTargetSchema,
    requiredEvidence: z
      .array(releaseUpgradeEvidenceIdSchema)
      .min(1)
      .max(releaseUpgradeEvidenceIdSchema.options.length),
    state: updatePreparationStateSchema,
    preparedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    localApproval: updateLocalApprovalSchema.nullable(),
    authorization: updateAuthorizationSummarySchema.nullable(),
    appliedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((preparation, context) => {
    if (Date.parse(preparation.expiresAt) <= Date.parse(preparation.preparedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Update preparation must expire after it was prepared',
        path: ['expiresAt'],
      })
    }
    if (
      ['approved', 'authorized', 'applied'].includes(preparation.state) &&
      preparation.localApproval === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Approved update states require local approval evidence',
        path: ['localApproval'],
      })
    }
    if (
      preparation.state === 'awaiting-local-approval' &&
      (preparation.localApproval !== null ||
        preparation.authorization !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Awaiting preparations cannot contain approval evidence',
        path: ['localApproval'],
      })
    }
    if (
      preparation.localApproval &&
      (Date.parse(preparation.localApproval.approvedAt) <
        Date.parse(preparation.preparedAt) ||
        Date.parse(preparation.localApproval.approvedAt) >=
          Date.parse(preparation.expiresAt) ||
        Date.parse(preparation.localApproval.expiresAt) >
          Date.parse(preparation.expiresAt))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Local approval must fall within the preparation window',
        path: ['localApproval'],
      })
    }
    if (
      ['authorized', 'applied'].includes(preparation.state) &&
      preparation.authorization === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Authorized update states require authorization evidence',
        path: ['authorization'],
      })
    }
    if (
      ['authorized', 'applied'].includes(preparation.state) &&
      preparation.localApproval?.consumedAt === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Authorized update states require consumed local approval',
        path: ['localApproval', 'consumedAt'],
      })
    }
    if (
      preparation.authorization &&
      (Date.parse(preparation.authorization.authorizedAt) <
        Date.parse(preparation.preparedAt) ||
        Date.parse(preparation.authorization.expiresAt) >
          Date.parse(preparation.expiresAt))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Authorization must fall within the preparation window',
        path: ['authorization'],
      })
    }
    if ((preparation.state === 'applied') !== (preparation.appliedAt !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Applied update state requires appliedAt',
        path: ['appliedAt'],
      })
    }
  })

export const updateApplyAuthorizationSchema = z
  .object({
    formatVersion: z.literal(UPDATE_EVIDENCE_FORMAT_VERSION),
    authorizationId: z.uuid(),
    preparationId: z.uuid(),
    localApprovalId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    source: releaseUpgradeSourceSchema,
    target: updateTargetSchema,
    strategy: z.literal('in-place-expand-contract'),
    rollbackPolicy: z.literal('roll-forward-after-migration'),
    authorizedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((authorization, context) => {
    const lifetime =
      Date.parse(authorization.expiresAt) - Date.parse(authorization.authorizedAt)
    if (lifetime <= 0 || lifetime > 60 * 60_000) {
      context.addIssue({
        code: 'custom',
        message: 'Update authorization must expire within one hour',
        path: ['expiresAt'],
      })
    }
  })

export type UpdateTarget = z.output<typeof updateTargetSchema>
export type UpdatePreparation = z.output<typeof updatePreparationSchema>
export type UpdateApplyAuthorization = z.output<
  typeof updateApplyAuthorizationSchema
>
