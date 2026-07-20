import { z } from 'zod'
import { instanceHealthObservationSchema } from './health.js'
import { semanticVersionSchema } from './releases.js'
import {
  updateApplyAuthorizationSchema,
  updatePreparationSchema,
} from './updates.js'

export const MANAGEMENT_PROTOCOL_VERSION = '1' as const
export const MANAGEMENT_API_PREFIX = '/api/management/v1' as const
export const INSTANCE_TOPOLOGY = 'single-church' as const

export const managementCapabilitySchema = z.enum([
  'instance.status.read',
  'instance.health.read',
  'backup.export',
  'update.prepare',
  'update.apply',
  'support.session.request',
  'management.disconnect',
])

export type ManagementCapability = z.infer<typeof managementCapabilitySchema>

export const supportSessionScopeSchema = z.enum([
  'operational-diagnostics',
])

export type SupportSessionScope = z.infer<typeof supportSessionScopeSchema>

export const supportSessionOperatorSchema = z
  .object({
    id: z.string().min(1).max(128),
    displayName: z.string().min(1).max(160),
  })
  .strict()

export type SupportSessionOperator = z.infer<
  typeof supportSessionOperatorSchema
>

export const infrastructureOwnerSchema = z.enum(['fellowship42', 'church'])
export const instanceOperatorSchema = z.enum([
  'fellowship42',
  'church',
  'partner',
])

export const instanceDescriptorSchema = z
  .object({
    protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
    instanceId: z.string().min(1).max(128),
    topology: z.literal(INSTANCE_TOPOLOGY),
    applicationVersion: semanticVersionSchema,
    schemaVersion: z.number().int().nonnegative(),
    infrastructure: z
      .object({
        owner: infrastructureOwnerSchema,
        operator: instanceOperatorSchema,
      })
      .strict(),
    capabilities: z.array(managementCapabilitySchema).max(32),
  })
  .strict()
  .refine(
    (descriptor) =>
      new Set(descriptor.capabilities).size === descriptor.capabilities.length,
    { message: 'Capabilities must be unique', path: ['capabilities'] },
  )

export type InstanceDescriptor = z.infer<typeof instanceDescriptorSchema>

const commandBase = {
  protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
  commandId: z.uuid(),
  instanceId: z.string().min(1).max(128),
  issuedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{22,128}$/),
}

const commands = [
  z
    .object({
      ...commandBase,
      type: z.literal('instance.status.read'),
      capability: z.literal('instance.status.read'),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal('instance.health.read'),
      capability: z.literal('instance.health.read'),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal('backup.export'),
      capability: z.literal('backup.export'),
      input: z
        .object({
          reason: z.string().min(1).max(240),
          retentionDays: z.number().int().min(1).max(365),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal('update.prepare'),
      capability: z.literal('update.prepare'),
      input: z
        .object({
          releaseTag: z.string().regex(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
          releaseManifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal('update.apply'),
      capability: z.literal('update.apply'),
      input: z
        .object({
          preparationId: z.uuid(),
          localApprovalId: z.uuid(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal('support.session.request'),
      capability: z.literal('support.session.request'),
      input: z
        .object({
          reason: z.string().min(1).max(500),
          requestedMinutes: z.number().int().min(5).max(120),
          requestId: z.uuid().optional(),
          scope: supportSessionScopeSchema.optional(),
          supportOperator: supportSessionOperatorSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal('management.disconnect'),
      capability: z.literal('management.disconnect'),
      input: z
        .object({
          reason: z.string().min(1).max(240),
          localApprovalId: z.uuid(),
        })
        .strict(),
    })
    .strict(),
] as const

export const managementCommandSchema = z
  .discriminatedUnion('type', commands)
  .refine(
    (command) => Date.parse(command.expiresAt) > Date.parse(command.issuedAt),
    {
      message: 'expiresAt must be later than issuedAt',
      path: ['expiresAt'],
    },
  )
  .refine(
    (command) =>
      Date.parse(command.expiresAt) - Date.parse(command.issuedAt) <= 300_000,
    {
      message: 'Commands may be valid for at most five minutes',
      path: ['expiresAt'],
    },
  )

export type ManagementCommand = z.infer<typeof managementCommandSchema>

const managementCommandResultOutputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('instance.status'),
      application: z.enum(['healthy', 'degraded', 'unavailable']),
      database: z.enum(['ready', 'degraded', 'unavailable']),
      objectStorage: z.enum(['ready', 'degraded', 'unavailable']),
      backupFreshness: z.enum(['fresh', 'stale', 'unknown']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('instance.health'),
      observation: instanceHealthObservationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('operation'),
      operationId: z.uuid(),
      state: z.enum(['queued', 'running', 'succeeded']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('update.preparation'),
      preparation: updatePreparationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('update.authorization'),
      authorization: updateApplyAuthorizationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('support.request'),
      requestId: z.uuid(),
      state: z.enum([
        'awaiting-local-approval',
        'approved',
        'rejected',
        'revoked',
        'expired',
      ]),
      scope: supportSessionScopeSchema.optional(),
      supportOperator: supportSessionOperatorSchema.optional(),
      requestedAt: z.iso.datetime({ offset: true }).optional(),
      approvedAt: z.iso.datetime({ offset: true }).optional(),
      expiresAt: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('disconnect'),
      disconnected: z.literal(true),
    })
    .strict(),
])

export const managementCommandResultSchema = z
  .object({
    protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
    commandId: z.uuid(),
    instanceId: z.string().min(1).max(128),
    commandType: managementCapabilitySchema,
    status: z.enum(['accepted', 'succeeded', 'rejected', 'failed']),
    completedAt: z.iso.datetime({ offset: true }).optional(),
    output: managementCommandResultOutputSchema.optional(),
    error: z
      .object({
        code: z.string().min(1).max(128),
        message: z.string().min(1).max(1_000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((result, context) => {
    const terminal = ['succeeded', 'rejected', 'failed'].includes(result.status)
    if (terminal && !result.completedAt) {
      context.addIssue({
        code: 'custom',
        message: 'Terminal command results require completedAt',
        path: ['completedAt'],
      })
    }
    if (['rejected', 'failed'].includes(result.status) && !result.error) {
      context.addIssue({
        code: 'custom',
        message: 'Rejected and failed command results require an error',
        path: ['error'],
      })
    }
    if (result.status === 'succeeded' && result.error) {
      context.addIssue({
        code: 'custom',
        message: 'Succeeded command results cannot include an error',
        path: ['error'],
      })
    }
    if (
      result.output?.kind === 'instance.status' &&
      result.commandType !== 'instance.status.read'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Status output requires an instance.status.read command',
        path: ['output'],
      })
    }
    if (
      result.output?.kind === 'instance.health' &&
      result.commandType !== 'instance.health.read'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Health output requires an instance.health.read command',
        path: ['output'],
      })
    }
    if (
      result.output?.kind === 'support.request' &&
      result.commandType !== 'support.session.request'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Support output requires a support.session.request command',
        path: ['output'],
      })
    }
    if (
      result.output?.kind === 'update.preparation' &&
      result.commandType !== 'update.prepare'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Update preparation output requires an update.prepare command',
        path: ['output'],
      })
    }
    if (
      result.output?.kind === 'update.authorization' &&
      result.commandType !== 'update.apply'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Update authorization output requires an update.apply command',
        path: ['output'],
      })
    }
    if (
      result.output?.kind === 'disconnect' &&
      result.commandType !== 'management.disconnect'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Disconnect output requires a management.disconnect command',
        path: ['output'],
      })
    }
  })

export type ManagementCommandResult = z.infer<
  typeof managementCommandResultSchema
>
