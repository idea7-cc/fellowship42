import { z } from 'zod'

export const RELEASE_MANIFEST_FORMAT_VERSION = 1 as const

export const semanticVersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    'Expected a semantic version',
  )

export const sha256DigestSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Expected a lowercase SHA-256 digest')

export const releaseArtifactKindSchema = z.enum([
  'portable-instance-source',
  'management-protocol-package',
  'lifecycle-cli-package',
])

const requiredReleaseArtifactKinds = [
  'portable-instance-source',
  'management-protocol-package',
] as const

export const releaseArtifactSchema = z.object({
  file: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\]+$/, 'Artifact must be a simple filename'),
  kind: releaseArtifactKindSchema,
  bytes: z.number().int().positive(),
  sha256: sha256DigestSchema,
})

export type ReleaseArtifact = z.infer<typeof releaseArtifactSchema>

export const releaseManifestSchema = z
  .object({
    formatVersion: z.literal(RELEASE_MANIFEST_FORMAT_VERSION),
    application: z.object({
      name: z.literal('fellowship42'),
      version: semanticVersionSchema,
      schemaVersion: z.number().int().nonnegative(),
    }),
    managementProtocol: z.object({
      package: z.literal('@fellowship42/management-protocol'),
      packageVersion: semanticVersionSchema,
      wireVersion: z.string().regex(/^\d+$/),
    }),
    source: z.object({
      repository: z.literal('https://github.com/idea7-cc/fellowship42'),
      commit: z.string().regex(/^[0-9a-f]{40}$/),
      committedAt: z.iso.datetime({ offset: true }),
    }),
    artifacts: z.array(releaseArtifactSchema).min(2),
  })
  .superRefine((manifest, context) => {
    const files = new Set<string>()
    const kinds = new Set<string>()

    for (const artifact of manifest.artifacts) {
      if (files.has(artifact.file)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate artifact filename: ${artifact.file}`,
          path: ['artifacts'],
        })
      }
      files.add(artifact.file)
      kinds.add(artifact.kind)
    }

    for (const requiredKind of requiredReleaseArtifactKinds) {
      if (!kinds.has(requiredKind)) {
        context.addIssue({
          code: 'custom',
          message: `Missing required artifact kind: ${requiredKind}`,
          path: ['artifacts'],
        })
      }
    }
  })

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>
