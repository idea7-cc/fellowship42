import { z } from 'zod'
import { portableInstanceIdSchema } from './lifecycle.js'
import { semanticVersionSchema } from './releases.js'

export const INSTANCE_HEALTH_FORMAT_VERSION = 1 as const

export const instanceHealthComponentStatusSchema = z.enum([
  'ready',
  'degraded',
  'unavailable',
  'not-applicable',
  'unknown',
])

export const instanceHealthObservationSchema = z
  .object({
    formatVersion: z.literal(INSTANCE_HEALTH_FORMAT_VERSION),
    portableInstanceId: portableInstanceIdSchema,
    observedAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    source: z.enum([
      'instance-doctor',
      'management-sync',
      'operator-verified',
    ]),
    overallStatus: z.enum([
      'healthy',
      'degraded',
      'unavailable',
      'unknown',
    ]),
    release: z
      .object({
        applicationVersion: semanticVersionSchema,
        schemaVersion: z.number().int().nonnegative(),
        managementProtocolWireVersion: z.string().regex(/^\d+$/),
      })
      .strict(),
    connection: z
      .object({
        status: z.enum([
          'not-enrolled',
          'connected',
          'degraded',
          'disconnected',
          'unknown',
        ]),
        grantVersion: z.number().int().positive().nullable(),
      })
      .strict(),
    checks: z
      .object({
        database: instanceHealthComponentStatusSchema,
        objectStorage: instanceHealthComponentStatusSchema,
        authentication: instanceHealthComponentStatusSchema,
        migrations: z.enum(['current', 'pending', 'failed', 'unknown']),
        realtime: instanceHealthComponentStatusSchema,
        paymentWebhooks: z.enum(['ready', 'unconfigured', 'unknown']),
        outbox: z.enum([
          'clear',
          'backlog-small',
          'backlog-large',
          'blocked',
          'unknown',
        ]),
      })
      .strict(),
    traffic: z
      .object({
        availability: z.enum([
          'healthy',
          'degraded',
          'unavailable',
          'unknown',
        ]),
        errorRate: z.enum(['none', 'low', 'elevated', 'high', 'unknown']),
        latency: z.enum(['low', 'normal', 'high', 'unknown']),
        window: z.enum([
          'five-minutes',
          'fifteen-minutes',
          'one-hour',
          'unknown',
        ]),
      })
      .strict(),
  })
  .strict()
  .superRefine((observation, context) => {
    if (
      observation.connection.status === 'not-enrolled' &&
      observation.connection.grantVersion !== null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A non-enrolled observation cannot report a grant version',
        path: ['connection', 'grantVersion'],
      })
    }
    if (
      observation.connection.status === 'connected' &&
      observation.connection.grantVersion === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A connected observation must report its grant version',
        path: ['connection', 'grantVersion'],
      })
    }
    const hasKnownDegradation =
      ['degraded', 'disconnected'].includes(observation.connection.status) ||
      [
        observation.checks.database,
        observation.checks.objectStorage,
        observation.checks.authentication,
        observation.checks.realtime,
      ].some((status) => ['degraded', 'unavailable'].includes(status)) ||
      ['pending', 'failed'].includes(observation.checks.migrations) ||
      ['backlog-large', 'blocked'].includes(observation.checks.outbox) ||
      ['degraded', 'unavailable'].includes(
        observation.traffic.availability,
      ) ||
      ['elevated', 'high'].includes(observation.traffic.errorRate) ||
      observation.traffic.latency === 'high'
    if (observation.overallStatus === 'healthy' && hasKnownDegradation) {
      context.addIssue({
        code: 'custom',
        message: 'A healthy observation cannot contain known degradation',
        path: ['overallStatus'],
      })
    }
  })

export type InstanceHealthComponentStatus = z.output<
  typeof instanceHealthComponentStatusSchema
>
export type InstanceHealthObservation = z.output<
  typeof instanceHealthObservationSchema
>
