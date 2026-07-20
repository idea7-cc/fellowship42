import { z } from 'zod'
import { sha256DigestSchema } from './releases.js'

export const instanceBootstrapStateSchema = z.enum([
  'configuration-invalid',
  'awaiting-owner-configuration',
  'awaiting-owner',
  'configured',
  'identity-mismatch',
])

export const instanceRuntimeHealthSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    service: z.literal('fellowship42-instance'),
    topology: z.literal('single-church'),
    storage: z.literal('d1'),
    outbox: z.enum(['clear', 'backlogged', 'stalled']),
    paymentWebhooks: z.enum(['ready', 'unconfigured']),
    bootstrap: z
      .object({
        state: instanceBootstrapStateSchema,
        portableIdentitySha256: sha256DigestSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((health, context) => {
    const invalid = health.bootstrap.state === 'configuration-invalid'
    if (invalid !== (health.bootstrap.portableIdentitySha256 === null)) {
      context.addIssue({
        code: 'custom',
        message:
          'Only invalid portable identity configuration may omit its digest',
        path: ['bootstrap', 'portableIdentitySha256'],
      })
    }
    const degraded =
      health.outbox === 'stalled' ||
      ['configuration-invalid', 'identity-mismatch'].includes(
        health.bootstrap.state,
      )
    if ((health.status === 'degraded') !== degraded) {
      context.addIssue({
        code: 'custom',
        message: 'Runtime status must reflect durable or identity degradation',
        path: ['status'],
      })
    }
  })

export type InstanceBootstrapState = z.output<
  typeof instanceBootstrapStateSchema
>
export type InstanceRuntimeHealth = z.output<typeof instanceRuntimeHealthSchema>
