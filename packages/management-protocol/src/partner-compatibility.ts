import { z } from 'zod'

export const PARTNER_COMPATIBILITY_PROFILE =
  'f42-partner-compatibility-v1' as const

export const partnerCompatibilityInputIdSchema = z.enum([
  'release-artifact-verification',
  'offline-instance-doctor',
  'management-adapter-conformance',
  'portable-restore-conformance',
  'hosted-to-church-owned-rehearsal',
])

const orderedInputIds = partnerCompatibilityInputIdSchema.options

export const partnerCompatibilityInputSchema = z
  .object({
    id: partnerCompatibilityInputIdSchema,
    kind: z.enum(['command', 'fixture']),
    publicReference: z
      .string()
      .min(1)
      .max(240)
      .regex(/^(?:pnpm |@fellowship42\/|docs\/)/),
    evidenceSchema: z.string().min(1).max(100),
    containsChurchPayload: z.literal(false),
    requiresProviderCredential: z.literal(false),
  })
  .strict()

export const partnerCompatibilityProfileSchema = z
  .object({
    formatVersion: z.literal(1),
    profile: z.literal(PARTNER_COMPATIBILITY_PROFILE),
    scope: z.literal('public-compatibility-inputs'),
    certificationBoundary: z.literal(
      'does-not-certify-a-live-provider-account-or-partner',
    ),
    inputs: z
      .array(partnerCompatibilityInputSchema)
      .length(orderedInputIds.length),
  })
  .strict()
  .superRefine((profile, context) => {
    for (const [index, id] of orderedInputIds.entries()) {
      if (profile.inputs[index]?.id !== id) {
        context.addIssue({
          code: 'custom',
          message: `Partner compatibility input ${index} must be ${id}`,
          path: ['inputs', index, 'id'],
        })
      }
    }
  })

export type PartnerCompatibilityProfile = z.output<
  typeof partnerCompatibilityProfileSchema
>

