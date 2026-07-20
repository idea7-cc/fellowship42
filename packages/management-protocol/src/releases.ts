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

export const releaseUpgradeEvidenceIdSchema = z.enum([
  'release-artifacts-verified',
  'doctor-pass',
  'portable-export-verified',
  'explicit-approval',
])

export const releaseUpgradeSourceSchema = z
  .object({
    releaseTag: z.string().regex(/^v\d+\.\d+\.\d+$/),
    releaseManifestSha256: sha256DigestSchema,
    applicationVersion: semanticVersionSchema,
    schemaVersion: z.number().int().nonnegative(),
    managementProtocolWireVersion: z.string().regex(/^\d+$/),
  })
  .strict()
  .superRefine((source, context) => {
    if (source.releaseTag !== `v${source.applicationVersion}`) {
      context.addIssue({
        code: 'custom',
        message: 'Upgrade source tag must match its application version',
        path: ['releaseTag'],
      })
    }
  })

export const releaseUpgradeTargetSchema = z
  .object({
    applicationVersion: semanticVersionSchema,
    schemaVersion: z.number().int().nonnegative(),
    managementProtocolWireVersion: z.string().regex(/^\d+$/),
  })
  .strict()

export const releaseUpgradeMetadataSchema = z
  .object({
    formatVersion: z.literal(1),
    strategy: z.literal('in-place-expand-contract'),
    rollbackPolicy: z.literal('roll-forward-after-migration'),
    target: releaseUpgradeTargetSchema,
    eligibleSources: z.array(releaseUpgradeSourceSchema).min(1).max(64),
    requiredEvidence: z
      .array(releaseUpgradeEvidenceIdSchema)
      .min(1)
      .max(releaseUpgradeEvidenceIdSchema.options.length),
  })
  .strict()
  .superRefine((metadata, context) => {
    const sourceKeys = new Set<string>()
    for (const [index, source] of metadata.eligibleSources.entries()) {
      const key = [
        source.releaseTag,
        source.releaseManifestSha256,
        source.applicationVersion,
        source.schemaVersion,
        source.managementProtocolWireVersion,
      ].join(':')
      if (sourceKeys.has(key)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate eligible upgrade source',
          path: ['eligibleSources', index],
        })
      }
      sourceKeys.add(key)
    }

    const evidence = new Set(metadata.requiredEvidence)
    if (evidence.size !== metadata.requiredEvidence.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate required upgrade evidence',
        path: ['requiredEvidence'],
      })
    }
  })

export type ReleaseUpgradeSource = z.infer<typeof releaseUpgradeSourceSchema>
export type ReleaseUpgradeTarget = z.infer<typeof releaseUpgradeTargetSchema>
export type ReleaseUpgradeMetadata = z.infer<typeof releaseUpgradeMetadataSchema>

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
    upgrade: releaseUpgradeMetadataSchema.optional(),
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

    if (manifest.upgrade) {
      const target = manifest.upgrade.target
      if (target.applicationVersion !== manifest.application.version) {
        context.addIssue({
          code: 'custom',
          message: 'Upgrade target application version does not match manifest',
          path: ['upgrade', 'target', 'applicationVersion'],
        })
      }
      if (target.schemaVersion !== manifest.application.schemaVersion) {
        context.addIssue({
          code: 'custom',
          message: 'Upgrade target schema version does not match manifest',
          path: ['upgrade', 'target', 'schemaVersion'],
        })
      }
      if (
        target.managementProtocolWireVersion !==
        manifest.managementProtocol.wireVersion
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Upgrade target wire version does not match manifest',
          path: ['upgrade', 'target', 'managementProtocolWireVersion'],
        })
      }
    }
  })

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>

export type ReleaseUpgradeEligibility =
  | {
      eligible: true
      code: 'eligible'
      requiredEvidence: ReleaseUpgradeMetadata['requiredEvidence']
    }
  | {
      eligible: false
      code: 'upgrade-metadata-missing' | 'source-not-eligible'
      requiredEvidence: []
    }

export function assessReleaseUpgradeEligibility(
  target: ReleaseManifest,
  source: ReleaseUpgradeSource,
): ReleaseUpgradeEligibility {
  if (!target.upgrade) {
    return {
      eligible: false,
      code: 'upgrade-metadata-missing',
      requiredEvidence: [],
    }
  }

  const eligible = target.upgrade.eligibleSources.some(
    (candidate) =>
      candidate.releaseTag === source.releaseTag &&
      candidate.releaseManifestSha256 === source.releaseManifestSha256 &&
      candidate.applicationVersion === source.applicationVersion &&
      candidate.schemaVersion === source.schemaVersion &&
      candidate.managementProtocolWireVersion ===
        source.managementProtocolWireVersion,
  )
  return eligible
    ? {
        eligible: true,
        code: 'eligible',
        requiredEvidence: [...target.upgrade.requiredEvidence],
      }
    : {
        eligible: false,
        code: 'source-not-eligible',
        requiredEvidence: [],
      }
}
