import { z } from 'zod'
import {
  MANAGEMENT_PROTOCOL_VERSION,
  managementCommandSchema,
  managementCommandResultSchema,
} from './management.js'
import {
  managementJwsSchema,
  managementPublicKeySchema,
  signManagementPayload,
  verifyManagementJws,
  type EnrollmentChallenge,
  type ManagementJws,
  type ManagementPublicKey,
} from './security.js'
import { semanticVersionSchema } from './releases.js'

export const MANAGEMENT_ADAPTER_CONFORMANCE_PROFILE =
  'f42-instance-management-adapter-v1' as const

export const managementAdapterConformanceScenarioIdSchema = z.enum([
  'owner-controlled-enrollment',
  'signed-status-command',
  'exact-command-replay',
  'local-grant-denial',
  'instance-key-rotation',
  'local-disconnect',
])

const orderedScenarioIds =
  managementAdapterConformanceScenarioIdSchema.options

export const managementAdapterConformanceReportSchema = z
  .object({
    formatVersion: z.literal(1),
    profile: z.literal(MANAGEMENT_ADAPTER_CONFORMANCE_PROFILE),
    instance: z
      .object({
        applicationVersion: semanticVersionSchema,
        schemaVersion: z.number().int().nonnegative(),
        managementProtocolPackageVersion: semanticVersionSchema,
        managementProtocolWireVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
      })
      .strict(),
    scenarios: z
      .array(
        z
          .object({
            id: managementAdapterConformanceScenarioIdSchema,
            status: z.literal('passed'),
          })
          .strict(),
      )
      .length(orderedScenarioIds.length),
  })
  .strict()
  .superRefine((report, context) => {
    for (const [index, id] of orderedScenarioIds.entries()) {
      if (report.scenarios[index]?.id !== id) {
        context.addIssue({
          code: 'custom',
          message: `Conformance scenario ${index} must be ${id}`,
          path: ['scenarios', index, 'id'],
        })
      }
    }
  })

export type ManagementAdapterConformanceReport = z.infer<
  typeof managementAdapterConformanceReportSchema
>

export type ManagementConformanceTransport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface ManagementAdapterConformanceHarness {
  createEnrollmentChallenge(now: number): Promise<EnrollmentChallenge>
  submitEnrollmentProposal(
    input: {
      challengeId: string
      oneTimeCode: string
      operatorKey: ManagementPublicKey
      proposal: ManagementJws
    },
    now: number,
  ): Promise<void>
  approveEnrollment(
    challengeId: string,
    grants: unknown,
    now: number,
  ): Promise<{ connectionId: string; approval: ManagementJws }>
  syncOnce(
    now: number,
    transport: ManagementConformanceTransport,
  ): Promise<{ state: 'disconnected' | 'succeeded'; commandCount: number }>
  rotateInstanceIdentity(now: number): Promise<void>
  disconnectLocally(now: number): Promise<void>
}

interface RuntimeIdentity {
  publicKey: ManagementPublicKey
  privateKey: CryptoKey
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function runtimeIdentity(keyId: string): Promise<RuntimeIdentity> {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return {
    publicKey: managementPublicKeySchema.parse({
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      kid: keyId,
      use: 'sig',
      alg: 'EdDSA',
    }),
    privateKey: pair.privateKey,
  }
}

async function requestEnvelope(init?: RequestInit): Promise<ManagementJws> {
  const body = JSON.parse(String(init?.body)) as { jws?: unknown }
  return managementJwsSchema.parse(body.jws)
}

function assertion(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Management conformance failed: ${message}`)
}

export async function runManagementAdapterConformance(
  harness: ManagementAdapterConformanceHarness,
  release: ManagementAdapterConformanceReport['instance'],
  now: number,
): Promise<ManagementAdapterConformanceReport> {
  const operator = await runtimeIdentity(`operator-key-${crypto.randomUUID()}`)
  const challenge = await harness.createEnrollmentChallenge(now)
  const proposal = await signManagementPayload(
    {
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      type: 'enrollment.proposal',
      messageId: crypto.randomUUID(),
      challengeId: challenge.challengeId,
      instanceId: challenge.instanceId,
      senderKeyId: operator.publicKey.kid,
      audienceKeyId: challenge.instanceKey.kid,
      nonce: randomNonce(),
      operator: {
        id: 'operator_public-conformance',
        displayName: 'Public conformance operator',
        key: operator.publicKey,
        syncUrl: 'https://conformance.example.test/api/management/v1/sync',
      },
      requestedCapabilities: ['instance.status.read', 'backup.export'],
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    },
    operator.privateKey,
  )
  await harness.submitEnrollmentProposal(
    {
      challengeId: challenge.challengeId,
      oneTimeCode: challenge.oneTimeCode,
      operatorKey: operator.publicKey,
      proposal,
    },
    now,
  )
  const grants = {
    grantVersion: 1,
    grants: [
      {
        capability: 'instance.status.read' as const,
        grantedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
        requiresLocalApproval: false,
      },
    ],
    approvedAt: new Date(now).toISOString(),
    reviewDueAt: new Date(now + 12 * 60 * 60_000).toISOString(),
  }
  const approved = await harness.approveEnrollment(
    challenge.challengeId,
    grants,
    now,
  )

  let instanceKey = challenge.instanceKey
  let syncRound = 0
  let firstBatch: ManagementJws | null = null
  let firstResults: ManagementJws | null = null
  let statusPassed = false
  let replayPassed = false
  let grantDenialPassed = false
  let rotationPassed = false

  const transport: ManagementConformanceTransport = async (_input, init) => {
    const envelope = await requestEnvelope(init)
    const payload = await verifyManagementJws(envelope, instanceKey)
    if (payload.type === 'enrollment.approval') {
      assertion(
        payload.connectionId === approved.connectionId &&
          payload.challengeId === challenge.challengeId &&
          payload.operatorKeyId === operator.publicKey.kid &&
          payload.instanceKeyId === challenge.instanceKey.kid,
        'enrollment approval was not bound to the challenge and keys',
      )
      return new Response(null, { status: 204 })
    }
    if (payload.type === 'key.rotate') {
      assertion(
        payload.senderKeyId === instanceKey.kid &&
          payload.replacementKey.kid !== instanceKey.kid,
        'rotation was not authorized by the active instance key',
      )
      instanceKey = payload.replacementKey
      rotationPassed = true
      return new Response(null, { status: 204 })
    }
    if (payload.type === 'sync.request') {
      syncRound += 1
      assertion(
        payload.connectionId === approved.connectionId &&
          payload.instanceId === challenge.instanceId &&
          payload.audienceKeyId === operator.publicKey.kid,
        'sync request binding was invalid',
      )
      if (syncRound === 2) {
        assertion(firstBatch, 'the replay batch was not created')
        return Response.json({ jws: firstBatch })
      }
      const command =
        syncRound === 1
          ? {
              protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
              commandId: crypto.randomUUID(),
              instanceId: challenge.instanceId,
              type: 'instance.status.read' as const,
              capability: 'instance.status.read' as const,
              issuedAt: new Date(now).toISOString(),
              expiresAt: new Date(now + 5 * 60_000).toISOString(),
              nonce: randomNonce(),
              input: {},
            }
          : syncRound === 3
            ? {
                protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
                commandId: crypto.randomUUID(),
                instanceId: challenge.instanceId,
                type: 'backup.export' as const,
                capability: 'backup.export' as const,
                issuedAt: new Date(now + 2_000).toISOString(),
                expiresAt: new Date(now + 302_000).toISOString(),
                nonce: randomNonce(),
                input: { reason: 'public conformance denial', retentionDays: 1 },
              }
            : null
      const batch = await signManagementPayload(
        {
          protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
          type: 'command.batch',
          messageId: crypto.randomUUID(),
          connectionId: approved.connectionId,
          instanceId: challenge.instanceId,
          senderKeyId: operator.publicKey.kid,
          audienceKeyId: instanceKey.kid,
          issuedAt: new Date(now + (syncRound - 1) * 1_000).toISOString(),
          expiresAt: new Date(
            now + (syncRound - 1) * 1_000 + 5 * 60_000,
          ).toISOString(),
          nonce: randomNonce(),
          commands: command ? [managementCommandSchema.parse(command)] : [],
          nextCommandCursor: `conformance-cursor-${syncRound}`,
        },
        operator.privateKey,
      )
      if (syncRound === 1) firstBatch = batch
      return Response.json({ jws: batch })
    }
    if (payload.type === 'command.results') {
      if (syncRound === 1) {
        const result = managementCommandResultSchema.parse(payload.results[0])
        statusPassed =
          result.status === 'succeeded' &&
          result.commandType === 'instance.status.read' &&
          result.output?.kind === 'instance.status'
        firstResults = envelope
      } else if (syncRound === 2) {
        replayPassed = JSON.stringify(envelope) === JSON.stringify(firstResults)
      } else if (syncRound === 3) {
        const result = managementCommandResultSchema.parse(payload.results[0])
        grantDenialPassed =
          result.status === 'rejected' &&
          result.commandType === 'backup.export' &&
          result.error?.code === 'capability_not_granted'
      } else {
        assertion(payload.results.length === 0, 'rotation heartbeat was not empty')
      }
      return new Response(null, { status: 204 })
    }
    throw new Error(`Management conformance received ${payload.type}`)
  }

  await harness.syncOnce(now, transport)
  await harness.syncOnce(now + 1_000, transport)
  await harness.syncOnce(now + 2_000, transport)
  await harness.rotateInstanceIdentity(now + 3_000)
  await harness.syncOnce(now + 3_000, transport)
  await harness.disconnectLocally(now + 4_000)
  const disconnected = await harness.syncOnce(now + 4_000, transport)

  assertion(statusPassed, 'the granted status command did not succeed')
  assertion(replayPassed, 'an exact command retry changed its signed result')
  assertion(grantDenialPassed, 'an ungranted backup command was not denied')
  assertion(rotationPassed, 'instance key rotation was not delivered by the old key')
  assertion(
    disconnected.state === 'disconnected' && disconnected.commandCount === 0,
    'local disconnect did not stop management sync',
  )

  return managementAdapterConformanceReportSchema.parse({
    formatVersion: 1,
    profile: MANAGEMENT_ADAPTER_CONFORMANCE_PROFILE,
    instance: release,
    scenarios: orderedScenarioIds.map((id) => ({ id, status: 'passed' })),
  })
}
