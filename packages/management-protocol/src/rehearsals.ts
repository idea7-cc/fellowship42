import { z } from 'zod'
import { deploymentReleaseSchema, portableInstanceIdSchema } from './lifecycle.js'
import { sha256DigestSchema } from './releases.js'

export const MIGRATION_REHEARSAL_FORMAT_VERSION = 1 as const

export const migrationRehearsalAssertionIdSchema = z.enum([
  'export-verified',
  'new-empty-destination',
  'd1-restored',
  'r2-restored',
  'credentials-rotated',
  'portable-identity-preserved',
  'runtime-healthy',
  'cutover-approved',
  'independent-operation-verified',
  'source-routing-retired',
])

export const migrationRehearsalEvidenceSchema = z
  .object({
    formatVersion: z.literal(MIGRATION_REHEARSAL_FORMAT_VERSION),
    evidenceId: z.uuid(),
    scenario: z.literal('hosted-to-church-owned'),
    operationId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    sourceCustody: z.literal('fellowship42-hosted'),
    destinationCustody: z.literal('church-owned'),
    sourceRelease: deploymentReleaseSchema,
    destinationRelease: deploymentReleaseSchema,
    exportManifestSha256: sha256DigestSchema,
    destinationManifestSha256: sha256DigestSchema,
    planSha256: sha256DigestSchema,
    restoreReportSha256: sha256DigestSchema,
    cutoverApprovalSha256: sha256DigestSchema,
    completionReportSha256: sha256DigestSchema,
    startedAt: z.iso.datetime({ offset: true }),
    restoreVerifiedAt: z.iso.datetime({ offset: true }),
    cutoverApprovedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }),
    status: z.literal('verified'),
    assertions: z.array(
      z
        .object({
          id: migrationRehearsalAssertionIdSchema,
          status: z.literal('pass'),
          code: z
            .string()
            .min(1)
            .max(100)
            .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      JSON.stringify(evidence.sourceRelease) !==
      JSON.stringify(evidence.destinationRelease)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Rehearsal format v1 requires an exact release match',
        path: ['destinationRelease'],
      })
    }
    const orderedTimes = [
      evidence.startedAt,
      evidence.restoreVerifiedAt,
      evidence.cutoverApprovedAt,
      evidence.completedAt,
    ].map(Date.parse)
    if (orderedTimes.some((time, index) => index > 0 && time < orderedTimes[index - 1]!)) {
      context.addIssue({
        code: 'custom',
        message: 'Rehearsal evidence timestamps must be monotonic',
        path: ['completedAt'],
      })
    }
    if (
      evidence.assertions.length !==
      migrationRehearsalAssertionIdSchema.options.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Rehearsal evidence must contain every assertion',
        path: ['assertions'],
      })
      return
    }
    for (const [index, assertion] of evidence.assertions.entries()) {
      const expected = migrationRehearsalAssertionIdSchema.options[index]
      if (
        assertion.id !== expected ||
        assertion.code !== `${expected}-passed`
      ) {
        context.addIssue({
          code: 'custom',
          message: `Expected ordered passing rehearsal assertion ${expected}`,
          path: ['assertions', index],
        })
      }
    }
  })

export type MigrationRehearsalEvidence = z.output<
  typeof migrationRehearsalEvidenceSchema
>
