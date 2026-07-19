import { z } from 'zod'
import { semanticVersionSchema } from './releases'

export * from './releases'

export const MANAGEMENT_PROTOCOL_VERSION = '1' as const
export const MANAGEMENT_API_PREFIX = '/api/management/v1' as const
export const INSTANCE_TOPOLOGY = 'single-church' as const

export const managementCapabilitySchema = z.enum([
  'instance.status.read',
  'backup.export',
  'update.prepare',
  'update.apply',
  'support.session.request',
  'management.disconnect',
])

export type ManagementCapability = z.infer<typeof managementCapabilitySchema>

export const infrastructureOwnerSchema = z.enum(['fellowship42', 'church'])
export const instanceOperatorSchema = z.enum(['fellowship42', 'church', 'partner'])

export const instanceDescriptorSchema = z.object({
  protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
  instanceId: z.string().min(1).max(128),
  topology: z.literal(INSTANCE_TOPOLOGY),
  applicationVersion: semanticVersionSchema,
  schemaVersion: z.number().int().nonnegative(),
  infrastructure: z.object({
    owner: infrastructureOwnerSchema,
    operator: instanceOperatorSchema,
  }),
  capabilities: z.array(managementCapabilitySchema),
})

export type InstanceDescriptor = z.infer<typeof instanceDescriptorSchema>

export const managementCommandSchema = z
  .object({
    protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
    commandId: z.uuid(),
    instanceId: z.string().min(1).max(128),
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    nonce: z.string().min(16).max(256),
    capability: managementCapabilitySchema,
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((command) => Date.parse(command.expiresAt) > Date.parse(command.issuedAt), {
    message: 'expiresAt must be later than issuedAt',
    path: ['expiresAt'],
  })

export type ManagementCommand = z.infer<typeof managementCommandSchema>

export const managementCommandResultSchema = z.object({
  protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
  commandId: z.uuid(),
  instanceId: z.string().min(1).max(128),
  status: z.enum(['accepted', 'succeeded', 'rejected', 'failed']),
  completedAt: z.iso.datetime({ offset: true }).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.string().min(1).max(128),
      message: z.string().min(1).max(1_000),
    })
    .optional(),
})

export type ManagementCommandResult = z.infer<typeof managementCommandResultSchema>
