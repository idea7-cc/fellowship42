import { z } from 'zod'
import { deploymentReleaseSchema, portableInstanceIdSchema } from './lifecycle.js'
import { semanticVersionSchema, sha256DigestSchema } from './releases.js'

export const PORTABLE_EXPORT_FORMAT_VERSION = 1 as const

const portablePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..'),
    'Path must be a normalized relative POSIX path',
  )

export const exportArtifactKindSchema = z.enum([
  'd1-sql',
  'portable-configuration',
  'r2-index',
])

export const exportArtifactSchema = z
  .object({
    kind: exportArtifactKindSchema,
    file: portablePathSchema,
    bytes: z.number().int().nonnegative(),
    sha256: sha256DigestSchema,
  })
  .strict()

export const portableConfigurationSchema = z
  .object({
    formatVersion: z.literal(PORTABLE_EXPORT_FORMAT_VERSION),
    instanceId: portableInstanceIdSchema,
    settings: z
      .object({
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

export const r2ExportObjectSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(1_024)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Object key contains control characters'),
    file: portablePathSchema,
    bytes: z.number().int().nonnegative(),
    sha256: sha256DigestSchema,
  })
  .strict()
  .superRefine((object, context) => {
    if (object.file !== `r2/objects/${object.sha256}`) {
      context.addIssue({
        code: 'custom',
        message: 'R2 object file must be addressed by its SHA-256 digest',
        path: ['file'],
      })
    }
  })

export const r2ExportIndexSchema = z
  .object({
    formatVersion: z.literal(PORTABLE_EXPORT_FORMAT_VERSION),
    objects: z.array(r2ExportObjectSchema).max(1_000_000),
  })
  .strict()
  .superRefine((index, context) => {
    const keys = new Set<string>()
    for (const [position, object] of index.objects.entries()) {
      if (keys.has(object.key)) {
        context.addIssue({
          code: 'custom',
          message: 'R2 object keys must be unique',
          path: ['objects', position, 'key'],
        })
      }
      keys.add(object.key)
    }
  })

export const portableExportManifestSchema = z
  .object({
    formatVersion: z.literal(PORTABLE_EXPORT_FORMAT_VERSION),
    instanceId: portableInstanceIdSchema,
    sourceRelease: deploymentReleaseSchema,
    exportedAt: z.iso.datetime({ offset: true }),
    consistency: z
      .object({
        mode: z.literal('operator-quiesced'),
        quiescedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
    artifacts: z.array(exportArtifactSchema).length(3),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (Date.parse(manifest.exportedAt) < Date.parse(manifest.consistency.quiescedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Export cannot precede the quiesce boundary',
        path: ['exportedAt'],
      })
    }
    const expected = [
      ['d1-sql', 'd1/database.sql'],
      ['portable-configuration', 'config/portable.json'],
      ['r2-index', 'r2/index.json'],
    ] as const
    for (const [position, [kind, file]] of expected.entries()) {
      const artifact = manifest.artifacts[position]
      if (artifact?.kind !== kind || artifact.file !== file) {
        context.addIssue({
          code: 'custom',
          message: `Expected ${kind} at ${file}`,
          path: ['artifacts', position],
        })
      }
    }
  })

export type PortableExportManifest = z.output<typeof portableExportManifestSchema>
export type PortableConfiguration = z.output<typeof portableConfigurationSchema>
export type R2ExportIndex = z.output<typeof r2ExportIndexSchema>

export const exportEvidenceSchema = z
  .object({
    formatVersion: z.literal(PORTABLE_EXPORT_FORMAT_VERSION),
    evidenceId: z.uuid(),
    instanceId: portableInstanceIdSchema,
    sourceApplicationVersion: semanticVersionSchema,
    sourceSchemaVersion: z.number().int().nonnegative(),
    sourceManagementProtocolPackageVersion: semanticVersionSchema,
    exportManifestSha256: sha256DigestSchema,
    exportedAt: z.iso.datetime({ offset: true }),
    verifiedAt: z.iso.datetime({ offset: true }),
    consistencyMode: z.literal('operator-quiesced'),
    verificationStatus: z.literal('verified'),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (Date.parse(evidence.verifiedAt) < Date.parse(evidence.exportedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Verification cannot precede export',
        path: ['verifiedAt'],
      })
    }
  })

export type ExportEvidence = z.output<typeof exportEvidenceSchema>
