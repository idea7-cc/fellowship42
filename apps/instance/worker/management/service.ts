import {
  MANAGEMENT_PROTOCOL_VERSION,
  enrollmentChallengeSchema,
  managementGrantSetSchema,
  managementJwsSchema,
  managementPublicKeyFingerprint,
  managementPublicKeySchema,
  signManagementPayload,
  verifyManagementJws,
  type EnrollmentChallenge,
  type ManagementGrantSet,
  type ManagementJws,
  type ManagementPublicKey,
} from '@fellowship42/management-protocol'
import { z } from 'zod'
import { AppError } from '../lib/errors'

export type ManagementBindings = Env & {
  MANAGEMENT_KEY_ENCRYPTION_KEY?: string
  MANAGEMENT_KEY_ENCRYPTION_KEY_PREVIOUS?: string
  F42_INFRASTRUCTURE_OWNER?: 'fellowship42' | 'church'
  F42_INSTANCE_OPERATOR?: 'fellowship42' | 'church' | 'partner'
}

type Installation = {
  instanceId: string
  churchId: string
}

type StoredIdentity = {
  instanceId: string
  keyId: string
  publicKey: ManagementPublicKey
  ciphertext: string
  iv: string
}

type ActiveConnection = {
  connectionId: string
  instanceId: string
  enrollmentChallengeId: string
  operatorId: string
  operatorDisplayName: string
  operatorKey: ManagementPublicKey
  syncUrl: string
  grantVersion: number
  grantSet: ManagementGrantSet
  grantReviewDueAt: number
  approvedAt: number
  enrollmentApproval: ManagementJws
  approvalDeliveredAt: number | null
  pendingControlMessage: ManagementJws | null
  pendingRotationLocalApprovalId: string | null
  pendingReplacement: StoredIdentity | null
  lastSyncAt: number | null
  lastSyncStatus: 'succeeded' | 'failed' | null
  lastSyncCode: string | null
  commandCursor: string | null
}

const enrollmentSubmissionSchema = z
  .object({
    challengeId: z.uuid(),
    oneTimeCode: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
    operatorKey: managementPublicKeySchema,
    proposal: managementJwsSchema,
  })
  .strict()

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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function importWrappingKey(encodedKey: string): Promise<CryptoKey> {
  const rawKey = decodeBase64Url(encodedKey)
  if (rawKey.byteLength !== 32) {
    throw new Error('Management wrapping keys must contain exactly 32 bytes')
  }
  return crypto.subtle.importKey(
    'raw',
    rawKey.buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
}

async function managementWrappingKey(
  env: ManagementBindings,
): Promise<CryptoKey> {
  const encodedKey = env.MANAGEMENT_KEY_ENCRYPTION_KEY?.trim()
  if (!encodedKey) {
    throw new AppError(
      503,
      'management_key_not_configured',
      'Management key encryption is not configured for this instance',
    )
  }
  try {
    return await importWrappingKey(encodedKey)
  } catch {
    throw new AppError(
      503,
      'management_key_invalid',
      'Management key encryption is misconfigured',
    )
  }
}

async function installation(db: D1Database): Promise<Installation> {
  const row = await db
    .prepare(
      `SELECT instance_id, primary_church_id
       FROM instance_metadata WHERE singleton = 1`,
    )
    .first<{ instance_id: string; primary_church_id: string }>()
  if (!row) {
    throw new AppError(
      409,
      'instance_not_configured',
      'Configure the instance before enabling management',
    )
  }
  return { instanceId: row.instance_id, churchId: row.primary_church_id }
}

async function readIdentity(db: D1Database): Promise<StoredIdentity | null> {
  const row = await db
    .prepare(
      `SELECT instance_id, key_id, public_jwk_json,
              private_jwk_ciphertext, private_jwk_iv
       FROM management_identities WHERE singleton = 1`,
    )
    .first<{
      instance_id: string
      key_id: string
      public_jwk_json: string
      private_jwk_ciphertext: string
      private_jwk_iv: string
    }>()
  return row
    ? {
        instanceId: row.instance_id,
        keyId: row.key_id,
        publicKey: managementPublicKeySchema.parse(
          JSON.parse(row.public_jwk_json),
        ),
        ciphertext: row.private_jwk_ciphertext,
        iv: row.private_jwk_iv,
      }
    : null
}

async function generateEncryptedIdentity(
  env: ManagementBindings,
  instanceId: string,
): Promise<StoredIdentity> {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const [publicJwk, privateJwk, wrappingKey] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey),
    managementWrappingKey(env),
  ])
  const keyId = `instance-key-${crypto.randomUUID()}`
  const publicKey = managementPublicKeySchema.parse({
    kty: publicJwk.kty,
    crv: publicJwk.crv,
    x: publicJwk.x,
    kid: keyId,
    use: 'sig',
    alg: 'EdDSA',
  })
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const additionalData = encoder.encode(
    `f42-management-key-v1:${instanceId}:${keyId}`,
  )
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    wrappingKey,
    encoder.encode(JSON.stringify(privateJwk)),
  )
  return {
    instanceId,
    keyId,
    publicKey,
    ciphertext: encodeBase64Url(new Uint8Array(encrypted)),
    iv: encodeBase64Url(iv),
  }
}

async function privateKey(
  env: ManagementBindings,
  identity: StoredIdentity,
): Promise<CryptoKey> {
  const current = env.MANAGEMENT_KEY_ENCRYPTION_KEY?.trim()
  if (!current) {
    throw new AppError(
      503,
      'management_key_not_configured',
      'Management key encryption is not configured for this instance',
    )
  }
  const candidates = [
    current,
    env.MANAGEMENT_KEY_ENCRYPTION_KEY_PREVIOUS?.trim(),
  ].filter((value): value is string => Boolean(value))
  let plaintext: ArrayBuffer | null = null
  for (const encodedKey of candidates) {
    try {
      const wrappingKey = await importWrappingKey(encodedKey)
      plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: decodeBase64Url(identity.iv).buffer as ArrayBuffer,
          additionalData: encoder.encode(
            `f42-management-key-v1:${identity.instanceId}:${identity.keyId}`,
          ),
        },
        wrappingKey,
        decodeBase64Url(identity.ciphertext).buffer as ArrayBuffer,
      )
      break
    } catch {
      // A previous key is accepted only during an explicit wrapping-key
      // rotation window. No key material or key identity is logged.
    }
  }
  if (!plaintext) {
    throw new AppError(
      503,
      'management_key_unavailable',
      'The management identity cannot be unlocked',
    )
  }
  const jwk = JSON.parse(decoder.decode(plaintext)) as JsonWebKey
  return crypto.subtle.importKey('jwk', jwk, 'Ed25519', false, ['sign'])
}

async function ensureIdentity(
  db: D1Database,
  env: ManagementBindings,
  instanceId: string,
  now: number,
): Promise<StoredIdentity> {
  const existing = await readIdentity(db)
  if (existing) {
    if (existing.instanceId !== instanceId) {
      throw new AppError(
        409,
        'management_identity_mismatch',
        'The management identity does not match the portable instance',
      )
    }
    await privateKey(env, existing)
    return existing
  }

  const generated = await generateEncryptedIdentity(env, instanceId)
  await db
    .prepare(
      `INSERT OR IGNORE INTO management_identities (
         singleton, instance_id, key_id, public_jwk_json,
         private_jwk_ciphertext, private_jwk_iv, created_at
       ) VALUES (1, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      generated.instanceId,
      generated.keyId,
      JSON.stringify(generated.publicKey),
      generated.ciphertext,
      generated.iv,
      now,
    )
    .run()
  const stored = await readIdentity(db)
  if (!stored) throw new Error('Management identity creation did not persist')
  return stored
}

async function activeConnection(
  db: D1Database,
): Promise<ActiveConnection | null> {
  const row = await db
    .prepare(
      `SELECT connection_id, instance_id, enrollment_challenge_id,
              operator_id, operator_display_name,
              operator_public_jwk_json, sync_url, grant_version,
              grant_set_json, approved_at,
              grant_review_due_at,
              enrollment_approval_jws_json, approval_delivered_at,
              pending_control_jws_json, pending_rotation_local_approval_id,
              pending_replacement_key_id,
              pending_replacement_public_jwk_json,
              pending_replacement_private_jwk_ciphertext,
              pending_replacement_private_jwk_iv,
              last_sync_at, last_sync_status, last_sync_code, command_cursor
       FROM management_connections
       WHERE status = 'active'
       LIMIT 1`,
    )
    .first<{
      connection_id: string
      instance_id: string
      enrollment_challenge_id: string
      operator_id: string
      operator_display_name: string
      operator_public_jwk_json: string
      sync_url: string
      grant_version: number
      grant_set_json: string
      grant_review_due_at: number
      approved_at: number
      enrollment_approval_jws_json: string
      approval_delivered_at: number | null
      pending_control_jws_json: string | null
      pending_rotation_local_approval_id: string | null
      pending_replacement_key_id: string | null
      pending_replacement_public_jwk_json: string | null
      pending_replacement_private_jwk_ciphertext: string | null
      pending_replacement_private_jwk_iv: string | null
      last_sync_at: number | null
      last_sync_status: 'succeeded' | 'failed' | null
      last_sync_code: string | null
      command_cursor: string | null
    }>()
  return row
    ? {
        connectionId: row.connection_id,
        instanceId: row.instance_id,
        enrollmentChallengeId: row.enrollment_challenge_id,
        operatorId: row.operator_id,
        operatorDisplayName: row.operator_display_name,
        operatorKey: managementPublicKeySchema.parse(
          JSON.parse(row.operator_public_jwk_json),
        ),
        syncUrl: row.sync_url,
        grantVersion: row.grant_version,
        grantSet: managementGrantSetSchema.parse(JSON.parse(row.grant_set_json)),
        grantReviewDueAt: row.grant_review_due_at,
        approvedAt: row.approved_at,
        enrollmentApproval: managementJwsSchema.parse(
          JSON.parse(row.enrollment_approval_jws_json),
        ),
        approvalDeliveredAt: row.approval_delivered_at,
        pendingControlMessage: row.pending_control_jws_json
          ? managementJwsSchema.parse(JSON.parse(row.pending_control_jws_json))
          : null,
        pendingRotationLocalApprovalId:
          row.pending_rotation_local_approval_id,
        pendingReplacement:
          row.pending_replacement_key_id &&
          row.pending_replacement_public_jwk_json &&
          row.pending_replacement_private_jwk_ciphertext &&
          row.pending_replacement_private_jwk_iv
            ? {
                instanceId: row.instance_id,
                keyId: row.pending_replacement_key_id,
                publicKey: managementPublicKeySchema.parse(
                  JSON.parse(row.pending_replacement_public_jwk_json),
                ),
                ciphertext:
                  row.pending_replacement_private_jwk_ciphertext,
                iv: row.pending_replacement_private_jwk_iv,
              }
            : null,
        lastSyncAt: row.last_sync_at,
        lastSyncStatus: row.last_sync_status,
        lastSyncCode: row.last_sync_code,
        commandCursor: row.command_cursor,
      }
    : null
}

export async function createEnrollmentChallenge(
  db: D1Database,
  env: ManagementBindings,
  actorUserId: string,
  requestId: string,
  now = Date.now(),
): Promise<EnrollmentChallenge> {
  const installed = await installation(db)
  if (await activeConnection(db)) {
    throw new AppError(
      409,
      'management_already_connected',
      'Disconnect the current operator before enrolling another',
    )
  }
  const identity = await ensureIdentity(db, env, installed.instanceId, now)
  const oneTimeCode = encodeBase64Url(
    crypto.getRandomValues(new Uint8Array(32)),
  )
  const challenge = enrollmentChallengeSchema.parse({
    protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
    challengeId: crypto.randomUUID(),
    instanceId: installed.instanceId,
    instanceKey: identity.publicKey,
    oneTimeCode,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
  })
  await db.batch([
    db
      .prepare(
        `UPDATE management_enrollment_challenges
         SET consumed_at = ?
         WHERE instance_id = ? AND consumed_at IS NULL`,
      )
      .bind(now, installed.instanceId),
    db
      .prepare(
        `INSERT INTO management_enrollment_challenges (
           challenge_id, instance_id, code_sha256, expires_at,
           created_by_user_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        challenge.challengeId,
        installed.instanceId,
        await sha256Hex(oneTimeCode),
        Date.parse(challenge.expiresAt),
        actorUserId,
        now,
      ),
    db
      .prepare(
        `INSERT INTO audit_events (
           id, church_id, actor_user_id, action, entity_type, entity_id,
           request_id, metadata_json, occurred_at
         ) VALUES (?, ?, ?, 'management.challenge_created',
                   'management_connection', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        installed.churchId,
        actorUserId,
        challenge.challengeId,
        requestId,
        JSON.stringify({
          keyId: identity.keyId,
          expiresAt: challenge.expiresAt,
        }),
        now,
      ),
  ])
  return challenge
}

export async function submitEnrollmentProposal(
  db: D1Database,
  inputValue: unknown,
  requestId: string,
  now = Date.now(),
) {
  const installed = await installation(db)
  const parsed = enrollmentSubmissionSchema.safeParse(inputValue)
  if (!parsed.success) {
    throw new AppError(
      422,
      'invalid_enrollment_submission',
      z.prettifyError(parsed.error),
    )
  }
  const input = parsed.data
  let proposal
  try {
    proposal = await verifyManagementJws(input.proposal, input.operatorKey)
  } catch {
    throw new AppError(
      403,
      'invalid_operator_signature',
      'The enrollment proposal signature is invalid',
    )
  }
  if (proposal.type !== 'enrollment.proposal') {
    throw new AppError(422, 'invalid_enrollment_message', 'Expected an enrollment proposal')
  }
  if (
    proposal.challengeId !== input.challengeId ||
    proposal.instanceId !== installed.instanceId ||
    proposal.audienceKeyId !== (await readIdentity(db))?.keyId
  ) {
    throw new AppError(403, 'enrollment_binding_mismatch', 'Enrollment proposal does not match this instance')
  }
  if (
    JSON.stringify(proposal.operator.key) !== JSON.stringify(input.operatorKey)
  ) {
    throw new AppError(
      403,
      'operator_key_mismatch',
      'The submitted operator key does not match the signed proposal',
    )
  }
  if (Date.parse(proposal.issuedAt) > now + 60_000 || Date.parse(proposal.expiresAt) < now - 60_000) {
    throw new AppError(403, 'enrollment_proposal_stale', 'Enrollment proposal is outside the accepted clock window')
  }

  const codeHash = await sha256Hex(input.oneTimeCode)
  const proposalWrite = await db.batch([
    db.prepare(
      `UPDATE management_enrollment_challenges
       SET consumed_at = ?, proposal_jws_json = ?, operator_id = ?,
           operator_display_name = ?, operator_key_id = ?,
           operator_public_jwk_json = ?, sync_url = ?,
           requested_capabilities_json = ?
       WHERE challenge_id = ? AND instance_id = ? AND consumed_at IS NULL
         AND expires_at >= ? AND code_sha256 = ?`,
    ).bind(
      now,
      JSON.stringify(input.proposal),
      proposal.operator.id,
      proposal.operator.displayName,
      proposal.operator.key.kid,
      JSON.stringify(proposal.operator.key),
      proposal.operator.syncUrl,
      JSON.stringify(proposal.requestedCapabilities),
      input.challengeId,
      installed.instanceId,
      now,
      codeHash,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO audit_events (
         id, church_id, actor_user_id, action, entity_type, entity_id,
         request_id, metadata_json, occurred_at
       )
       SELECT ?, ?, NULL, 'management.proposal_verified',
              'management_connection', ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM management_enrollment_challenges
         WHERE challenge_id = ? AND instance_id = ?
           AND consumed_at = ? AND proposal_jws_json = ?
       )`,
    ).bind(
      `management-proposal:${input.challengeId}`,
      installed.churchId,
      input.challengeId,
      requestId,
      JSON.stringify({
        operatorId: proposal.operator.id,
        operatorKeyId: proposal.operator.key.kid,
        requestedCapabilityCount: proposal.requestedCapabilities.length,
      }),
      now,
      input.challengeId,
      installed.instanceId,
      now,
      JSON.stringify(input.proposal),
    ),
  ])
  const result = proposalWrite[0]
  if ((result.meta.changes ?? 0) !== 1) {
    throw new AppError(403, 'enrollment_challenge_invalid', 'Enrollment challenge is invalid, expired, or already used')
  }
  return {
    challengeId: input.challengeId,
    operator: {
      id: proposal.operator.id,
      displayName: proposal.operator.displayName,
      syncUrl: proposal.operator.syncUrl,
      keyId: proposal.operator.key.kid,
      keyFingerprint: await managementPublicKeyFingerprint(proposal.operator.key),
    },
    requestedCapabilities: proposal.requestedCapabilities,
  }
}

export async function approveEnrollment(
  db: D1Database,
  env: ManagementBindings,
  challengeId: string,
  grantsInput: unknown,
  actorUserId: string,
  requestId: string,
  now = Date.now(),
): Promise<{ connectionId: string; approval: ManagementJws }> {
  const installed = await installation(db)
  const parsedGrants = managementGrantSetSchema.safeParse(grantsInput)
  if (!parsedGrants.success) {
    throw new AppError(
      422,
      'invalid_management_grants',
      z.prettifyError(parsedGrants.error),
    )
  }
  const grants = parsedGrants.data
  if (
    grants.grantVersion !== 1 ||
    Math.abs(Date.parse(grants.approvedAt) - now) > 60_000 ||
    Date.parse(grants.reviewDueAt) <= now ||
    grants.grants.some(
      (grant) =>
        Date.parse(grant.grantedAt) > now + 60_000 ||
        Date.parse(grant.expiresAt) <= now,
    )
  ) {
    throw new AppError(
      422,
      'invalid_management_grant_window',
      'Initial grants must be current, active, and use grant version 1',
    )
  }
  const challenge = await db
    .prepare(
      `SELECT operator_id, operator_display_name, operator_key_id,
              operator_public_jwk_json, sync_url, requested_capabilities_json,
              consumed_at
       FROM management_enrollment_challenges
       WHERE challenge_id = ? AND instance_id = ? AND consumed_at IS NOT NULL
         AND proposal_jws_json IS NOT NULL`,
    )
    .bind(challengeId, installed.instanceId)
    .first<{
      operator_id: string
      operator_display_name: string
      operator_key_id: string
      operator_public_jwk_json: string
      sync_url: string
      requested_capabilities_json: string
      consumed_at: number
    }>()
  if (!challenge) {
    throw new AppError(404, 'enrollment_proposal_not_found', 'Verified enrollment proposal not found')
  }
  if (challenge.consumed_at < now - 30 * 60_000) {
    throw new AppError(
      409,
      'enrollment_approval_expired',
      'Create a new enrollment challenge before approving this operator',
    )
  }
  if (await activeConnection(db)) {
    throw new AppError(409, 'management_already_connected', 'The instance already has an active operator')
  }
  const requested = new Set<string>(
    JSON.parse(challenge.requested_capabilities_json),
  )
  if (grants.grants.some((grant) => !requested.has(grant.capability))) {
    throw new AppError(422, 'grant_not_requested', 'A grant was not requested by the operator')
  }

  const identity = await readIdentity(db)
  if (!identity) throw new Error('Management identity is missing')
  const connectionId = crypto.randomUUID()
  const approvedAt = new Date(now).toISOString()
  const approvalPayload = {
    protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
    type: 'enrollment.approval',
    messageId: crypto.randomUUID(),
    challengeId,
    connectionId,
    instanceId: installed.instanceId,
    senderKeyId: identity.keyId,
    audienceKeyId: challenge.operator_key_id,
    issuedAt: approvedAt,
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    nonce: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    operatorId: challenge.operator_id,
    operatorKeyId: challenge.operator_key_id,
    instanceKeyId: identity.keyId,
    grants,
    approvedAt,
  } as const
  const approval = await signManagementPayload(
    approvalPayload,
    await privateKey(env, identity),
  )

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO management_connections (
           connection_id, instance_id, enrollment_challenge_id,
           operator_id, operator_display_name,
           operator_key_id, operator_public_jwk_json, sync_url, grant_version,
           grant_set_json, grant_review_due_at,
           status, approved_by_user_id, approved_at,
           enrollment_approval_jws_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .bind(
        connectionId,
        installed.instanceId,
        challengeId,
        challenge.operator_id,
        challenge.operator_display_name,
        challenge.operator_key_id,
        challenge.operator_public_jwk_json,
        challenge.sync_url,
        grants.grantVersion,
        JSON.stringify(grants),
        Date.parse(grants.reviewDueAt),
        actorUserId,
        now,
        JSON.stringify(approval),
      ),
    ...grants.grants.map((grant) =>
      db
        .prepare(
          `INSERT INTO management_grants (
             connection_id, capability, granted_at, expires_at,
             requires_local_approval
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          connectionId,
          grant.capability,
          Date.parse(grant.grantedAt),
          Date.parse(grant.expiresAt),
          grant.requiresLocalApproval ? 1 : 0,
        ),
    ),
    db
      .prepare(
        `INSERT INTO audit_events (
           id, church_id, actor_user_id, action, entity_type, entity_id,
           request_id, metadata_json, occurred_at
         ) VALUES (?, ?, ?, 'management.enrollment_approved',
                   'management_connection', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        installed.churchId,
        actorUserId,
        connectionId,
        requestId,
        JSON.stringify({
          operatorId: challenge.operator_id,
          operatorKeyId: challenge.operator_key_id,
          grantVersion: grants.grantVersion,
          grantCount: grants.grants.length,
        }),
        now,
      ),
  ]
  try {
    await db.batch(statements)
  } catch {
    throw new AppError(409, 'management_already_connected', 'The instance already has an active operator')
  }
  return { connectionId, approval }
}

export async function managementStatus(db: D1Database, now = Date.now()) {
  const installed = await installation(db)
  const identity = await readIdentity(db)
  const connection = await activeConnection(db)
  const pending = connection
    ? null
    : await db
        .prepare(
          `SELECT challenge_id, operator_id, operator_display_name,
                  operator_key_id, operator_public_jwk_json, sync_url,
                  requested_capabilities_json, consumed_at
           FROM management_enrollment_challenges
           WHERE instance_id = ? AND proposal_jws_json IS NOT NULL
             AND consumed_at >= ?
           ORDER BY consumed_at DESC LIMIT 1`,
        )
        .bind(installed.instanceId, now - 30 * 60_000)
        .first<{
          challenge_id: string
          operator_id: string
          operator_display_name: string
          operator_key_id: string
          operator_public_jwk_json: string
          sync_url: string
          requested_capabilities_json: string
          consumed_at: number
        }>()
  const grants = connection
    ? await db
        .prepare(
          `SELECT capability, granted_at, expires_at, requires_local_approval
           FROM management_grants WHERE connection_id = ? ORDER BY capability`,
        )
        .bind(connection.connectionId)
        .all<{
          capability: string
          granted_at: number
          expires_at: number
          requires_local_approval: number
        }>()
    : { results: [] }
  return {
    instanceId: installed.instanceId,
    enabled: Boolean(connection),
    identity: identity
      ? {
          keyId: identity.keyId,
          fingerprint: await managementPublicKeyFingerprint(identity.publicKey),
        }
      : null,
    pendingEnrollment: pending
      ? {
          challengeId: pending.challenge_id,
          operator: {
            id: pending.operator_id,
            displayName: pending.operator_display_name,
            syncUrl: pending.sync_url,
            keyId: pending.operator_key_id,
            keyFingerprint: await managementPublicKeyFingerprint(
              managementPublicKeySchema.parse(
                JSON.parse(pending.operator_public_jwk_json),
              ),
            ),
          },
          requestedCapabilities: JSON.parse(
            pending.requested_capabilities_json,
          ) as string[],
          submittedAt: new Date(pending.consumed_at).toISOString(),
        }
      : null,
    connection: connection
      ? {
          connectionId: connection.connectionId,
          operator: {
            id: connection.operatorId,
            displayName: connection.operatorDisplayName,
            keyId: connection.operatorKey.kid,
            keyFingerprint: await managementPublicKeyFingerprint(
              connection.operatorKey,
            ),
          },
          grantVersion: connection.grantVersion,
          rotationPending: Boolean(connection.pendingReplacement),
          grants: grants.results.map((grant) => ({
            capability: grant.capability,
            grantedAt: new Date(grant.granted_at).toISOString(),
            expiresAt: new Date(grant.expires_at).toISOString(),
            requiresLocalApproval: grant.requires_local_approval === 1,
          })),
          approvedAt: new Date(connection.approvedAt).toISOString(),
          lastSyncAt: connection.lastSyncAt
            ? new Date(connection.lastSyncAt).toISOString()
            : null,
          lastSyncStatus: connection.lastSyncStatus,
          lastSyncCode: connection.lastSyncCode,
        }
      : null,
  }
}

export async function rotateManagementIdentity(
  db: D1Database,
  env: ManagementBindings,
  actorUserId: string,
  requestId: string,
  now = Date.now(),
): Promise<ManagementJws> {
  const installed = await installation(db)
  const connection = await activeConnection(db)
  const previous = await readIdentity(db)
  if (!connection || !previous) {
    throw new AppError(409, 'management_not_connected', 'No active management connection exists')
  }
  if (connection.pendingReplacement) {
    throw new AppError(
      409,
      'management_rotation_pending',
      'The previous identity rotation has not been delivered yet',
    )
  }
  const replacement = await generateEncryptedIdentity(env, installed.instanceId)
  const localApprovalId = crypto.randomUUID()
  const payload = {
    protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
    type: 'key.rotate',
    messageId: crypto.randomUUID(),
    connectionId: connection.connectionId,
    instanceId: installed.instanceId,
    senderKeyId: previous.keyId,
    audienceKeyId: connection.operatorKey.kid,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    nonce: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    replacementKey: replacement.publicKey,
    activatesAt: new Date(now).toISOString(),
    previousKeyValidUntil: new Date(now + 5 * 60_000).toISOString(),
    localApprovalId,
  } as const
  const signed = await signManagementPayload(payload, await privateKey(env, previous))
  const rotation = await db.batch([
    db.prepare(
      `UPDATE management_connections
       SET pending_control_jws_json = ?,
           pending_rotation_local_approval_id = ?,
           pending_replacement_key_id = ?,
           pending_replacement_public_jwk_json = ?,
           pending_replacement_private_jwk_ciphertext = ?,
           pending_replacement_private_jwk_iv = ?
       WHERE connection_id = ? AND status = 'active'
         AND pending_replacement_key_id IS NULL
         AND EXISTS (
           SELECT 1 FROM management_identities
           WHERE singleton = 1 AND key_id = ?
         )`,
    ).bind(
      JSON.stringify(signed),
      localApprovalId,
      replacement.keyId,
      JSON.stringify(replacement.publicKey),
      replacement.ciphertext,
      replacement.iv,
      connection.connectionId,
      previous.keyId,
    ),
    db.prepare(
      `INSERT INTO audit_events (
         id, church_id, actor_user_id, action, entity_type, entity_id,
         request_id, metadata_json, occurred_at
       )
       SELECT ?, ?, ?, 'management.identity_rotated',
              'management_connection', ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM management_connections
         WHERE connection_id = ? AND status = 'active'
           AND pending_replacement_key_id = ?
       )`,
    ).bind(
      crypto.randomUUID(),
      installed.churchId,
      actorUserId,
      connection.connectionId,
      requestId,
      JSON.stringify({
        previousKeyId: previous.keyId,
        replacementKeyId: replacement.keyId,
      }),
      now,
      connection.connectionId,
      replacement.keyId,
    ),
  ])
  if ((rotation[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(
      409,
      'management_identity_changed',
      'The management identity or pending rotation changed during rotation',
    )
  }
  return signed
}

export async function disconnectManagement(
  db: D1Database,
  actorUserId: string,
  requestId: string,
  reason: string,
  now = Date.now(),
) {
  const installed = await installation(db)
  const connection = await activeConnection(db)
  if (!connection) {
    return { disconnected: false, alreadyDisconnected: true }
  }
  const disconnected = await db.batch([
    db
      .prepare(
        `UPDATE management_connections
         SET status = 'disconnected', disconnected_by_user_id = ?,
             disconnected_at = ?, disconnect_reason = ?
         WHERE connection_id = ? AND status = 'active'`,
      )
      .bind(actorUserId, now, reason, connection.connectionId),
    db
      .prepare(
        `DELETE FROM management_replay_records WHERE connection_id = ?`,
      )
      .bind(connection.connectionId),
    db
      .prepare(
        `DELETE FROM management_command_records WHERE connection_id = ?`,
      )
      .bind(connection.connectionId),
    db.prepare(`DELETE FROM management_identities WHERE singleton = 1`),
    db
      .prepare(
        `INSERT OR IGNORE INTO audit_events (
           id, church_id, actor_user_id, action, entity_type, entity_id,
           request_id, metadata_json, occurred_at
         )
         SELECT ?, ?, ?, 'management.disconnected',
                'management_connection', ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM management_connections
           WHERE connection_id = ? AND status = 'disconnected'
             AND disconnected_at = ?
         )`,
      )
      .bind(
        `management-disconnect:${connection.connectionId}`,
        installed.churchId,
        actorUserId,
        connection.connectionId,
        requestId,
        JSON.stringify({ operatorId: connection.operatorId, reason }),
        now,
        connection.connectionId,
        now,
      ),
  ])
  if ((disconnected[0]?.meta.changes ?? 0) !== 1) {
    return { disconnected: false, alreadyDisconnected: true }
  }
  return { disconnected: true, alreadyDisconnected: false }
}

export type { ActiveConnection, Installation, StoredIdentity }
export { activeConnection, installation, privateKey, readIdentity, sha256Hex }
