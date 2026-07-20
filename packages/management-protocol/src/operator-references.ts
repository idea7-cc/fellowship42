import { z } from 'zod'
import { semanticVersionSchema } from './releases.js'

export const OPERATOR_REFERENCE_CATALOG_FORMAT_VERSION = 1 as const

export const operatorReferenceKindSchema = z.enum([
  'release',
  'deployment',
  'portability',
  'management',
  'recovery',
  'security',
])

export const operatorReferenceAudienceSchema = z.enum([
  'church-owner',
  'self-hosting-operator',
  'partner-operator',
  'service-operator',
])

const referenceIdSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)

const sourcePathSchema = z
  .string()
  .min(1)
  .max(240)
  .regex(/^docs\/[a-z0-9][a-z0-9./-]*\.md$/)
  .refine((value) => !value.includes('..'), 'Source path cannot traverse')

export const operatorReferenceDefinitionSchema = z
  .object({
    id: referenceIdSchema,
    kind: operatorReferenceKindSchema.exclude(['release']),
    title: z.string().min(3).max(120),
    summary: z.string().min(10).max(300),
    audiences: z.array(operatorReferenceAudienceSchema).min(1).max(4),
    sourcePath: sourcePathSchema,
  })
  .strict()

export const operatorReferenceDefinitionsSchema = z
  .object({
    formatVersion: z.literal(OPERATOR_REFERENCE_CATALOG_FORMAT_VERSION),
    references: z.array(operatorReferenceDefinitionSchema).min(1).max(50),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = new Set<string>()
    const paths = new Set<string>()
    for (const [index, reference] of catalog.references.entries()) {
      if (ids.has(reference.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate operator reference ID: ${reference.id}`,
          path: ['references', index, 'id'],
        })
      }
      if (paths.has(reference.sourcePath)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate operator reference path: ${reference.sourcePath}`,
          path: ['references', index, 'sourcePath'],
        })
      }
      ids.add(reference.id)
      paths.add(reference.sourcePath)
    }
  })

export const operatorReferenceSchema = z
  .object({
    id: referenceIdSchema,
    kind: operatorReferenceKindSchema,
    title: z.string().min(3).max(120),
    summary: z.string().min(10).max(300),
    audiences: z.array(operatorReferenceAudienceSchema).min(1).max(4),
    immutableUrl: z.url(),
    sourcePath: sourcePathSchema.nullable(),
  })
  .strict()

export const operatorReferenceCatalogSchema = z
  .object({
    formatVersion: z.literal(OPERATOR_REFERENCE_CATALOG_FORMAT_VERSION),
    applicationVersion: semanticVersionSchema,
    releaseTag: z.string().regex(/^v\d+\.\d+\.\d+$/),
    source: z
      .object({
        repository: z.literal('https://github.com/idea7-cc/fellowship42'),
        commit: z.string().regex(/^[0-9a-f]{40}$/),
      })
      .strict(),
    references: z.array(operatorReferenceSchema).min(3).max(52),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (catalog.releaseTag !== `v${catalog.applicationVersion}`) {
      context.addIssue({
        code: 'custom',
        message: 'Reference catalog tag must match its application version',
        path: ['releaseTag'],
      })
    }

    const ids = new Set<string>()
    for (const [index, reference] of catalog.references.entries()) {
      if (ids.has(reference.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate operator reference ID: ${reference.id}`,
          path: ['references', index, 'id'],
        })
      }
      ids.add(reference.id)

      const expectedUrl = reference.sourcePath
        ? `${catalog.source.repository}/blob/${catalog.source.commit}/${reference.sourcePath}`
        : reference.id === 'release-manifest'
          ? `${catalog.source.repository}/releases/download/${catalog.releaseTag}/release-manifest.json`
          : reference.id === 'release-page'
            ? `${catalog.source.repository}/releases/tag/${catalog.releaseTag}`
            : null
      if (
        expectedUrl === null ||
        reference.immutableUrl !== expectedUrl ||
        (reference.kind === 'release') !== (reference.sourcePath === null)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Operator reference URL is not pinned to this release',
          path: ['references', index, 'immutableUrl'],
        })
      }
    }

    for (const requiredId of ['release-manifest', 'release-page']) {
      if (!ids.has(requiredId)) {
        context.addIssue({
          code: 'custom',
          message: `Missing required operator reference: ${requiredId}`,
          path: ['references'],
        })
      }
    }
  })

export type OperatorReferenceDefinition = z.infer<
  typeof operatorReferenceDefinitionSchema
>
export type OperatorReference = z.infer<typeof operatorReferenceSchema>
export type OperatorReferenceCatalog = z.infer<
  typeof operatorReferenceCatalogSchema
>
