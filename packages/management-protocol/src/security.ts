import { z } from 'zod'
import {
  MANAGEMENT_PROTOCOL_VERSION,
  instanceDescriptorSchema,
  managementCapabilitySchema,
  managementCommandResultSchema,
  managementCommandSchema,
} from './management.js'

export const MANAGEMENT_SECURITY_PROFILE = 'f42-jws-eddsa-v1' as const
export const MANAGEMENT_JWS_TYPE = 'f42-management+jws' as const
export const MANAGEMENT_SIGNATURE_ALGORITHM = 'EdDSA' as const
export const MANAGEMENT_MAX_CLOCK_SKEW_MS = 60_000
export const MANAGEMENT_MAX_MESSAGE_LIFETIME_MS = 300_000
export const MANAGEMENT_REPLAY_RETENTION_MS =
  MANAGEMENT_MAX_MESSAGE_LIFETIME_MS + MANAGEMENT_MAX_CLOCK_SKEW_MS

const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)
const identifierSchema = z.string().min(1).max(128)

export const managementPublicKeySchema = z
  .object({
    kty: z.literal('OKP'),
    crv: z.literal('Ed25519'),
    x: base64UrlSchema.length(43),
    kid: identifierSchema,
    use: z.literal('sig'),
    alg: z.literal(MANAGEMENT_SIGNATURE_ALGORITHM),
  })
  .strict()

export type ManagementPublicKey = z.infer<typeof managementPublicKeySchema>

export const managementGrantSchema = z
  .object({
    capability: managementCapabilitySchema,
    grantedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    requiresLocalApproval: z.boolean(),
  })
  .strict()
  .superRefine((grant, context) => {
    if (Date.parse(grant.expiresAt) <= Date.parse(grant.grantedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Grant expiry must be later than grant time',
        path: ['expiresAt'],
      })
    }

    if (
      ['update.apply', 'support.session.request', 'management.disconnect'].includes(
        grant.capability,
      ) &&
      !grant.requiresLocalApproval
    ) {
      context.addIssue({
        code: 'custom',
        message: `${grant.capability} requires local approval`,
        path: ['requiresLocalApproval'],
      })
    }
  })

export type ManagementGrant = z.infer<typeof managementGrantSchema>

export const managementGrantSetSchema = z
  .object({
    grantVersion: z.number().int().positive(),
    grants: z.array(managementGrantSchema).max(32),
    approvedAt: z.iso.datetime({ offset: true }),
    reviewDueAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((grantSet, context) => {
    if (Date.parse(grantSet.reviewDueAt) <= Date.parse(grantSet.approvedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Review due time must be later than approval time',
        path: ['reviewDueAt'],
      })
    }

    const capabilities = new Set<string>()
    for (const [index, grant] of grantSet.grants.entries()) {
      if (capabilities.has(grant.capability)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate grant: ${grant.capability}`,
          path: ['grants', index, 'capability'],
        })
      }
      capabilities.add(grant.capability)
    }
  })

export type ManagementGrantSet = z.infer<typeof managementGrantSetSchema>

export const enrollmentChallengeSchema = z
  .object({
    protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
    challengeId: z.uuid(),
    instanceId: identifierSchema,
    instanceKey: managementPublicKeySchema,
    oneTimeCode: base64UrlSchema.min(32).max(128),
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((challenge, context) => {
    const lifetime =
      Date.parse(challenge.expiresAt) - Date.parse(challenge.issuedAt)
    if (lifetime <= 0 || lifetime > 900_000) {
      context.addIssue({
        code: 'custom',
        message: 'Enrollment challenges must expire within 15 minutes',
        path: ['expiresAt'],
      })
    }
  })

export type EnrollmentChallenge = z.infer<typeof enrollmentChallengeSchema>

export const enrollmentProposalSchema = z
  .object({
    protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
    type: z.literal('enrollment.proposal'),
    messageId: z.uuid(),
    challengeId: z.uuid(),
    instanceId: identifierSchema,
    senderKeyId: identifierSchema,
    audienceKeyId: identifierSchema,
    nonce: base64UrlSchema.min(22).max(128),
    operator: z
      .object({
        id: identifierSchema,
        displayName: z.string().min(1).max(160),
        key: managementPublicKeySchema,
        syncUrl: z.url().startsWith('https://').max(2_048),
      })
      .strict(),
    requestedCapabilities: z.array(managementCapabilitySchema).max(32),
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((proposal, context) => {
    if (proposal.senderKeyId !== proposal.operator.key.kid) {
      context.addIssue({
        code: 'custom',
        message: 'Proposal sender must match the proposed operator key',
        path: ['senderKeyId'],
      })
    }
  })

export const enrollmentApprovalSchema = z
  .object({
    protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
    type: z.literal('enrollment.approval'),
    messageId: z.uuid(),
    challengeId: z.uuid(),
    connectionId: z.uuid(),
    instanceId: identifierSchema,
    senderKeyId: identifierSchema,
    audienceKeyId: identifierSchema,
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    nonce: base64UrlSchema.min(22).max(128),
    operatorId: identifierSchema,
    operatorKeyId: identifierSchema,
    instanceKeyId: identifierSchema,
    grants: managementGrantSetSchema,
    approvedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((approval, context) => {
    if (approval.senderKeyId !== approval.instanceKeyId) {
      context.addIssue({
        code: 'custom',
        message: 'Approval sender must match the instance key',
        path: ['senderKeyId'],
      })
    }
    if (approval.audienceKeyId !== approval.operatorKeyId) {
      context.addIssue({
        code: 'custom',
        message: 'Approval audience must match the operator key',
        path: ['audienceKeyId'],
      })
    }
  })

const signedClaimsFields = {
  protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
  messageId: z.uuid(),
  connectionId: z.uuid(),
  instanceId: identifierSchema,
  senderKeyId: identifierSchema,
  audienceKeyId: identifierSchema,
  issuedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  nonce: base64UrlSchema.min(22).max(128),
}

export const syncRequestSchema = z
  .object({
    ...signedClaimsFields,
    type: z.literal('sync.request'),
    descriptor: instanceDescriptorSchema,
    grantVersion: z.number().int().positive(),
    commandCursor: z.string().min(1).max(256).nullable(),
  })
  .strict()

export const commandBatchSchema = z
  .object({
    ...signedClaimsFields,
    type: z.literal('command.batch'),
    commands: z.array(managementCommandSchema).max(20),
    nextCommandCursor: z.string().min(1).max(256),
  })
  .strict()

export const commandResultsSchema = z
  .object({
    ...signedClaimsFields,
    type: z.literal('command.results'),
    results: z.array(managementCommandResultSchema).min(1).max(20),
  })
  .strict()

export const grantReplacementSchema = z
  .object({
    ...signedClaimsFields,
    type: z.literal('grant.replace'),
    grants: managementGrantSetSchema,
    localApprovalId: z.uuid(),
  })
  .strict()

export const keyRotationSchema = z
  .object({
    ...signedClaimsFields,
    type: z.literal('key.rotate'),
    replacementKey: managementPublicKeySchema,
    activatesAt: z.iso.datetime({ offset: true }),
    previousKeyValidUntil: z.iso.datetime({ offset: true }),
    localApprovalId: z.uuid(),
  })
  .strict()
  .refine(
    (rotation) =>
      Date.parse(rotation.previousKeyValidUntil) >=
      Date.parse(rotation.activatesAt),
    {
      message: 'The previous-key overlap cannot end before activation',
      path: ['previousKeyValidUntil'],
    },
  )

export const disconnectNoticeSchema = z
  .object({
    ...signedClaimsFields,
    type: z.literal('management.disconnected'),
    reason: z.string().min(1).max(240),
    finalGrantVersion: z.number().int().positive(),
  })
  .strict()

export const signedManagementPayloadSchema = z
  .discriminatedUnion('type', [
    enrollmentProposalSchema,
    enrollmentApprovalSchema,
    syncRequestSchema,
    commandBatchSchema,
    commandResultsSchema,
    grantReplacementSchema,
    keyRotationSchema,
    disconnectNoticeSchema,
  ])
  .superRefine((payload, context) => {
    const lifetime = Date.parse(payload.expiresAt) - Date.parse(payload.issuedAt)
    if (lifetime <= 0 || lifetime > MANAGEMENT_MAX_MESSAGE_LIFETIME_MS) {
      context.addIssue({
        code: 'custom',
        message: 'Signed messages must expire within five minutes',
        path: ['expiresAt'],
      })
    }
    if (payload.senderKeyId === payload.audienceKeyId) {
      context.addIssue({
        code: 'custom',
        message: 'Sender and audience keys must be different',
        path: ['audienceKeyId'],
      })
    }
  })

export type SignedManagementPayload = z.infer<
  typeof signedManagementPayloadSchema
>

export const managementJwsProtectedHeaderSchema = z
  .object({
    alg: z.literal(MANAGEMENT_SIGNATURE_ALGORITHM),
    kid: identifierSchema,
    typ: z.literal(MANAGEMENT_JWS_TYPE),
    f42v: z.literal(MANAGEMENT_PROTOCOL_VERSION),
  })
  .strict()

export const managementJwsSchema = z
  .object({
    protected: base64UrlSchema.min(16).max(1_024),
    payload: base64UrlSchema.min(16).max(262_144),
    signature: base64UrlSchema.length(86),
  })
  .strict()

export type ManagementJws = z.infer<typeof managementJwsSchema>

export const managementInteroperabilityFixtureSchema = z
  .object({
    formatVersion: z.literal(1),
    profile: z.literal(MANAGEMENT_SECURITY_PROFILE),
    publicKey: managementPublicKeySchema,
    payload: signedManagementPayloadSchema,
    jws: managementJwsSchema,
  })
  .strict()

export type ManagementInteroperabilityFixture = z.infer<
  typeof managementInteroperabilityFixtureSchema
>

export const protocolCompatibilitySchema = z
  .object({
    protocolVersion: z.literal(MANAGEMENT_PROTOCOL_VERSION),
    securityProfiles: z
      .array(z.literal(MANAGEMENT_SECURITY_PROFILE))
      .length(1),
    messageTypes: z
      .array(
        z.enum([
          'sync.request',
          'enrollment.proposal',
          'enrollment.approval',
          'command.batch',
          'command.results',
          'grant.replace',
          'key.rotate',
          'management.disconnected',
        ]),
      )
      .min(1),
    capabilities: z.array(managementCapabilitySchema).max(32),
  })
  .strict()

export type ProtocolCompatibility = z.infer<
  typeof protocolCompatibilitySchema
>

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function managementPublicKeyFingerprint(
  publicKeyInput: ManagementPublicKey,
): Promise<string> {
  const publicKey = managementPublicKeySchema.parse(publicKeyInput)
  const thumbprintInput = encoder.encode(
    JSON.stringify({ crv: publicKey.crv, kty: publicKey.kty, x: publicKey.x }),
  )
  return encodeBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', thumbprintInput)),
  )
}

export function managementReplayKey(payload: SignedManagementPayload): string {
  return `${payload.senderKeyId}:${payload.messageId}:${payload.nonce}`
}

export function assertFreshManagementPayload(
  payload: SignedManagementPayload,
  now = new Date(),
): void {
  const current = now.getTime()
  if (
    Date.parse(payload.issuedAt) > current + MANAGEMENT_MAX_CLOCK_SKEW_MS ||
    Date.parse(payload.expiresAt) < current - MANAGEMENT_MAX_CLOCK_SKEW_MS
  ) {
    throw new Error('Management message is outside the accepted clock window')
  }
}

export async function signManagementPayload(
  payloadInput: SignedManagementPayload,
  privateKey: CryptoKey,
): Promise<ManagementJws> {
  const payload = signedManagementPayloadSchema.parse(payloadInput)
  const protectedHeader = managementJwsProtectedHeaderSchema.parse({
    alg: MANAGEMENT_SIGNATURE_ALGORITHM,
    kid: payload.senderKeyId,
    typ: MANAGEMENT_JWS_TYPE,
    f42v: MANAGEMENT_PROTOCOL_VERSION,
  })
  const protectedValue = encodeBase64Url(
    encoder.encode(JSON.stringify(protectedHeader)),
  )
  const payloadValue = encodeBase64Url(encoder.encode(JSON.stringify(payload)))
  const signingInput = encoder.encode(`${protectedValue}.${payloadValue}`)
  const signature = await crypto.subtle.sign('Ed25519', privateKey, signingInput)

  return managementJwsSchema.parse({
    protected: protectedValue,
    payload: payloadValue,
    signature: encodeBase64Url(new Uint8Array(signature)),
  })
}

export async function verifyManagementJws(
  envelopeInput: ManagementJws,
  publicKeyInput: ManagementPublicKey,
): Promise<SignedManagementPayload> {
  const envelope = managementJwsSchema.parse(envelopeInput)
  const publicKey = managementPublicKeySchema.parse(publicKeyInput)
  const protectedHeader = managementJwsProtectedHeaderSchema.parse(
    JSON.parse(decoder.decode(decodeBase64Url(envelope.protected))),
  )
  if (protectedHeader.kid !== publicKey.kid) {
    throw new Error('JWS key identifier does not match the supplied key')
  }

  const importedKey = await crypto.subtle.importKey(
    'jwk',
    publicKey,
    'Ed25519',
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    'Ed25519',
    importedKey,
    decodeBase64Url(envelope.signature).buffer as ArrayBuffer,
    encoder.encode(`${envelope.protected}.${envelope.payload}`),
  )
  if (!valid) throw new Error('Invalid management JWS signature')

  const payload = signedManagementPayloadSchema.parse(
    JSON.parse(decoder.decode(decodeBase64Url(envelope.payload))),
  )
  if (payload.senderKeyId !== protectedHeader.kid) {
    throw new Error('Signed payload sender does not match the JWS key')
  }
  return payload
}
