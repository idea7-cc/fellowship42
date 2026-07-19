import { z } from 'zod'
import { semanticVersionSchema, sha256DigestSchema } from './releases.js'

export const LIFECYCLE_CONTRACT_VERSION = 1 as const

export const portableInstanceIdSchema = z
  .string()
  .regex(
    /^instance_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  )

const resourceNameSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/)
const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
  )
const releaseTagSchema = semanticVersionSchema.transform((value) => `v${value}`)

export const deploymentReleaseSchema = z
  .object({
    tag: z.string().regex(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    applicationVersion: semanticVersionSchema,
    schemaVersion: z.number().int().nonnegative(),
    managementProtocolPackageVersion: semanticVersionSchema,
    managementProtocolWireVersion: z.string().regex(/^\d+$/),
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    manifestUrl: z
      .url()
      .startsWith(
        'https://github.com/idea7-cc/fellowship42/releases/download/',
      ),
    manifestSha256: sha256DigestSchema,
  })
  .strict()
  .superRefine((release, context) => {
    const expectedTag = releaseTagSchema.parse(release.applicationVersion)
    if (release.tag !== expectedTag) {
      context.addIssue({
        code: 'custom',
        message: 'Release tag must match applicationVersion',
        path: ['tag'],
      })
    }
    const expectedUrl = `https://github.com/idea7-cc/fellowship42/releases/download/${release.tag}/release-manifest.json`
    if (release.manifestUrl !== expectedUrl) {
      context.addIssue({
        code: 'custom',
        message: 'Manifest URL must use the exact release tag',
        path: ['manifestUrl'],
      })
    }
  })

export const deploymentManifestSchema = z
  .object({
    formatVersion: z.literal(LIFECYCLE_CONTRACT_VERSION),
    instance: z
      .object({
        id: portableInstanceIdSchema,
        topology: z.literal('single-church'),
        release: deploymentReleaseSchema,
      })
      .strict(),
    custody: z
      .object({
        infrastructureOwner: z.enum(['fellowship42', 'church', 'partner']),
        operator: z.enum(['fellowship42', 'church', 'partner']),
      })
      .strict(),
    target: z
      .object({
        environment: z.enum(['local', 'staging', 'production']),
        accountAlias: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/),
      })
      .strict(),
    worker: z
      .object({
        name: resourceNameSchema,
        domains: z.array(hostnameSchema).max(8),
      })
      .strict(),
    resources: z
      .object({
        d1: z
          .object({ binding: z.literal('DB'), name: resourceNameSchema })
          .strict(),
        r2: z
          .object({ binding: z.literal('MEDIA'), name: resourceNameSchema })
          .strict(),
        outboxQueue: z
          .object({
            binding: z.literal('OUTBOX_QUEUE'),
            name: resourceNameSchema,
            deadLetterName: resourceNameSchema,
          })
          .strict(),
        durableObject: z
          .object({
            binding: z.literal('CHURCH_ROOMS'),
            className: z.literal('ChurchRoom'),
          })
          .strict(),
        schedules: z.tuple([z.literal('*/1 * * * *')]),
      })
      .strict(),
    configuration: z
      .object({
        accessTeamDomain: z.url().startsWith('https://').nullable(),
        accessAudienceConfigured: z.boolean(),
        paymentWebhookProvider: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/)
          .nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (
      manifest.target.environment === 'production' &&
      (!manifest.configuration.accessTeamDomain ||
        !manifest.configuration.accessAudienceConfigured)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Production manifests require configured Access identity',
        path: ['configuration'],
      })
    }
    if (
      manifest.resources.outboxQueue.name ===
      manifest.resources.outboxQueue.deadLetterName
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Outbox and dead-letter Queues must be different resources',
        path: ['resources', 'outboxQueue'],
      })
    }
  })

export type DeploymentManifest = z.output<typeof deploymentManifestSchema>

export const deployPlanStepKindSchema = z.enum([
  'verify-release',
  'ensure-d1',
  'ensure-r2',
  'ensure-outbox-queue',
  'ensure-dead-letter-queue',
  'configure-worker',
  'apply-migrations',
  'deploy-worker',
  'configure-domains',
  'configure-access',
  'verify-runtime',
])

export const deployPlanSchema = z
  .object({
    formatVersion: z.literal(LIFECYCLE_CONTRACT_VERSION),
    manifestSha256: sha256DigestSchema,
    instanceId: portableInstanceIdSchema,
    environment: z.enum(['local', 'staging', 'production']),
    steps: z.array(
      z
        .object({
          id: z.string().regex(/^step-[0-9]{2}$/),
          kind: deployPlanStepKindSchema,
          resourceName: resourceNameSchema.nullable(),
          dependsOn: z.array(z.string().regex(/^step-[0-9]{2}$/)),
          destructive: z.literal(false),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.steps.length !== deployPlanStepKindSchema.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'Deploy plan must contain every lifecycle step exactly once',
        path: ['steps'],
      })
    }
    const seen = new Set<string>()
    for (const [index, step] of plan.steps.entries()) {
      const expectedId = `step-${String(index + 1).padStart(2, '0')}`
      if (step.id !== expectedId) {
        context.addIssue({
          code: 'custom',
          message: `Expected ordered plan step ${expectedId}`,
          path: ['steps', index, 'id'],
        })
      }
      if (step.kind !== deployPlanStepKindSchema.options[index]) {
        context.addIssue({
          code: 'custom',
          message: 'Deploy plan step kind is out of order',
          path: ['steps', index, 'kind'],
        })
      }
      if (seen.has(step.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate plan step: ${step.id}`,
          path: ['steps', index, 'id'],
        })
      }
      for (const dependency of step.dependsOn) {
        if (!seen.has(dependency)) {
          context.addIssue({
            code: 'custom',
            message: `Dependency must refer to an earlier step: ${dependency}`,
            path: ['steps', index, 'dependsOn'],
          })
        }
      }
      seen.add(step.id)
    }
  })

export type DeployPlan = z.output<typeof deployPlanSchema>

export const doctorCheckIdSchema = z.enum([
  'release-manifest',
  'portable-identity',
  'worker-name',
  'd1-binding',
  'schema-version',
  'r2-binding',
  'outbox-queue',
  'dead-letter-queue',
  'durable-object',
  'schedule',
  'domains',
  'access',
  'runtime-health',
])

export const doctorReportSchema = z
  .object({
    formatVersion: z.literal(LIFECYCLE_CONTRACT_VERSION),
    checkedAt: z.iso.datetime({ offset: true }),
    manifestSha256: sha256DigestSchema,
    instanceId: portableInstanceIdSchema,
    release: deploymentReleaseSchema,
    status: z.enum(['healthy', 'attention', 'failed']),
    checks: z.array(
      z
        .object({
          id: doctorCheckIdSchema,
          status: z.enum(['pass', 'warning', 'fail', 'unknown']),
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
  .superRefine((report, context) => {
    if (report.checks.length !== doctorCheckIdSchema.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'Doctor report must contain every defined check exactly once',
        path: ['checks'],
      })
    }
    const ids = new Set<string>()
    for (const [index, check] of report.checks.entries()) {
      if (ids.has(check.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate doctor check: ${check.id}`,
          path: ['checks', index, 'id'],
        })
      }
      ids.add(check.id)
    }
    for (const requiredId of doctorCheckIdSchema.options) {
      if (!ids.has(requiredId)) {
        context.addIssue({
          code: 'custom',
          message: `Missing doctor check: ${requiredId}`,
          path: ['checks'],
        })
      }
    }
    const expectedStatus = report.checks.some(
      (check) => check.status === 'fail',
    )
      ? 'failed'
      : report.checks.some((check) =>
            ['warning', 'unknown'].includes(check.status),
          )
        ? 'attention'
        : 'healthy'
    if (report.status !== expectedStatus) {
      context.addIssue({
        code: 'custom',
        message: 'Doctor status must summarize check statuses',
        path: ['status'],
      })
    }
  })

export type DoctorReport = z.output<typeof doctorReportSchema>
