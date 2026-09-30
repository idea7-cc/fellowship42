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

export const WEBSITE_CMS_NAME = 'emdash' as const
export const WEBSITE_SCHEDULE = '* * * * *' as const

/**
 * The optional EmDash website component of one generated installation. It
 * shares the instance's portable identity, custody, deployment authority, and
 * `single-church` topology; it is not a second installation. The session KV
 * namespace is disposable and is never exported.
 */
export const deploymentWebsiteSchema = z
  .object({
    cms: z
      .object({
        name: z.literal(WEBSITE_CMS_NAME),
        version: semanticVersionSchema,
      })
      .strict(),
    worker: z
      .object({
        name: resourceNameSchema,
        domains: z.array(hostnameSchema).min(1).max(8),
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
        sessionKv: z
          .object({ binding: z.literal('SESSION'), name: resourceNameSchema })
          .strict(),
        instanceService: z
          .object({ binding: z.literal('FELLOWSHIP42') })
          .strict()
          .nullable(),
        schedules: z.tuple([z.literal(WEBSITE_SCHEDULE)]),
      })
      .strict(),
  })
  .strict()

export type DeploymentWebsite = z.output<typeof deploymentWebsiteSchema>

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
    website: deploymentWebsiteSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (
      new Set(manifest.worker.domains).size !== manifest.worker.domains.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Worker domains must be unique',
        path: ['worker', 'domains'],
      })
    }
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
    const website = manifest.website
    if (!website) return
    if (website.worker.name === manifest.worker.name) {
      context.addIssue({
        code: 'custom',
        message: 'The website and instance must be separate Workers',
        path: ['website', 'worker', 'name'],
      })
    }
    if (
      new Set(website.worker.domains).size !== website.worker.domains.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Website domains must be unique',
        path: ['website', 'worker', 'domains'],
      })
    }
    if (
      website.worker.domains.some((domain) =>
        manifest.worker.domains.includes(domain),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The website and instance must use separate hostnames',
        path: ['website', 'worker', 'domains'],
      })
    }
    if (manifest.worker.domains.length === 0) {
      context.addIssue({
        code: 'custom',
        message:
          'A website requires an instance domain for its Fellowship42 connection',
        path: ['worker', 'domains'],
      })
    }
    if (website.resources.d1.name === manifest.resources.d1.name) {
      context.addIssue({
        code: 'custom',
        message: 'The website requires its own D1 database',
        path: ['website', 'resources', 'd1', 'name'],
      })
    }
    if (website.resources.r2.name === manifest.resources.r2.name) {
      context.addIssue({
        code: 'custom',
        message: 'The website requires its own R2 bucket',
        path: ['website', 'resources', 'r2', 'name'],
      })
    }
  })

export type DeploymentManifest = z.output<typeof deploymentManifestSchema>

export const instanceDeployPlanStepKinds = [
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
] as const

/** Appended, in order, only when the manifest declares a website. */
export const websiteDeployPlanStepKinds = [
  'ensure-website-d1',
  'ensure-website-r2',
  'ensure-website-session-kv',
  'deploy-website-worker',
  'configure-website-domains',
  'verify-website',
] as const

export const deployPlanStepKindSchema = z.enum([
  ...instanceDeployPlanStepKinds,
  ...websiteDeployPlanStepKinds,
])

export type DeployPlanStepKind = z.output<typeof deployPlanStepKindSchema>

export function isWebsiteDeployPlanStepKind(kind: string): boolean {
  return (websiteDeployPlanStepKinds as readonly string[]).includes(kind)
}

/** The exact ordered step kinds for an installation with or without a website. */
export function deployPlanStepKindsFor(
  website: boolean,
): readonly DeployPlanStepKind[] {
  return website
    ? deployPlanStepKindSchema.options
    : instanceDeployPlanStepKinds
}

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
    const expectedKinds = deployPlanStepKindsFor(
      plan.steps.some((step) => isWebsiteDeployPlanStepKind(step.kind)),
    )
    if (plan.steps.length !== expectedKinds.length) {
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
      if (step.kind !== expectedKinds[index]) {
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

export const instanceDoctorCheckIds = [
  'release-manifest',
  'portable-identity',
  'release-coordinate',
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
] as const

/** Present, in order, only when the manifest declares a website. */
export const websiteDoctorCheckIds = [
  'website-worker-name',
  'website-d1-binding',
  'website-r2-binding',
  'website-session-kv',
  'website-instance-service',
  'website-schedule',
  'website-domains',
  'website-instance-pin',
  'website-origins',
] as const

export const doctorCheckIdSchema = z.enum([
  ...instanceDoctorCheckIds,
  ...websiteDoctorCheckIds,
])

export type DoctorCheckId = z.output<typeof doctorCheckIdSchema>

export function doctorCheckIdsFor(website: boolean): readonly DoctorCheckId[] {
  return website ? doctorCheckIdSchema.options : instanceDoctorCheckIds
}

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
    const expectedIds = doctorCheckIdsFor(
      report.checks.some((check) =>
        (websiteDoctorCheckIds as readonly string[]).includes(check.id),
      ),
    )
    if (report.checks.length !== expectedIds.length) {
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
    for (const requiredId of expectedIds) {
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
