import { z } from 'zod'
import { PORTABLE_EXPORT_FORMAT_VERSION } from './exports.js'
import { PORTABLE_IMPORT_FORMAT_VERSION } from './imports.js'
import { semanticVersionSchema } from './releases.js'

export const PORTABLE_RESTORE_CONFORMANCE_PROFILE =
  'f42-portable-restore-v1' as const

export const portableRestoreConformanceScenarioIdSchema = z.enum([
  'export-integrity-verified',
  'tampered-export-rejected',
  'new-empty-destination-required',
  'd1-and-r2-restored',
  'website-restored',
  'credentials-rotated',
  'portable-identity-preserved',
  'runtime-healthy-before-cutover',
  'cutover-and-source-untouched',
  'partial-restore-fails-closed',
])

export type PortableRestoreConformanceScenarioId = z.output<
  typeof portableRestoreConformanceScenarioIdSchema
>

/**
 * `website-restored` is present only when the conformance capture includes
 * the installation's website D1 and R2 artifacts.
 */
export function portableRestoreConformanceScenarioIdsFor(
  website: boolean,
): readonly PortableRestoreConformanceScenarioId[] {
  return website
    ? portableRestoreConformanceScenarioIdSchema.options
    : portableRestoreConformanceScenarioIdSchema.options.filter(
        (id) => id !== 'website-restored',
      )
}

export const portableRestoreConformanceReportSchema = z
  .object({
    formatVersion: z.literal(1),
    profile: z.literal(PORTABLE_RESTORE_CONFORMANCE_PROFILE),
    release: z
      .object({
        applicationVersion: semanticVersionSchema,
        schemaVersion: z.number().int().nonnegative(),
        managementProtocolPackageVersion: semanticVersionSchema,
        lifecycleCliVersion: semanticVersionSchema,
        exportFormatVersion: z.literal(PORTABLE_EXPORT_FORMAT_VERSION),
        importFormatVersion: z.literal(PORTABLE_IMPORT_FORMAT_VERSION),
      })
      .strict(),
    scenarios: z.array(
      z
        .object({
          id: portableRestoreConformanceScenarioIdSchema,
          status: z.literal('passed'),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((report, context) => {
    const orderedScenarioIds = portableRestoreConformanceScenarioIdsFor(
      report.scenarios.some((scenario) => scenario.id === 'website-restored'),
    )
    if (report.scenarios.length !== orderedScenarioIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Restore conformance must report every scenario exactly once',
        path: ['scenarios'],
      })
    }
    for (const [index, id] of orderedScenarioIds.entries()) {
      if (report.scenarios[index]?.id !== id) {
        context.addIssue({
          code: 'custom',
          message: `Restore conformance scenario ${index} must be ${id}`,
          path: ['scenarios', index, 'id'],
        })
      }
    }
  })

export type PortableRestoreConformanceReport = z.output<
  typeof portableRestoreConformanceReportSchema
>
