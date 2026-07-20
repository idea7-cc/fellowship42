import {
  MANAGEMENT_MAX_CLOCK_SKEW_MS,
  MANAGEMENT_PROTOCOL_VERSION,
  assertFreshManagementPayload,
  instanceHealthObservationSchema,
  managementCommandResultSchema,
  managementJwsSchema,
  signManagementPayload,
  verifyManagementJws,
  type ManagementCommand,
  type ManagementCommandResult,
  type ManagementJws,
} from '@fellowship42/management-protocol'
import { z } from 'zod'
import { AppError } from '../lib/errors'
import { APPLICATION_VERSION, SCHEMA_VERSION } from '../lib/release'
import { inspectInstanceRuntimeHealth } from '../lib/runtime-health'
import { requestSupportSession } from './support'
import {
  activeConnection,
  installation,
  privateKey,
  readIdentity,
  sha256Hex,
  type ActiveConnection,
  type ManagementBindings,
  type StoredIdentity,
} from './service'
import {
  authorizePreparedUpdate,
  prepareUpdate,
  type ReleaseFetchTransport,
} from './updates'

const MAX_RESPONSE_BYTES = 300_000

const envelopeResponseSchema = z.object({ jws: managementJwsSchema }).strict()

type FetchTransport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type ReplayOutcome = {
  response: ManagementJws
  nextCommandCursor: string
}

type ReplayRecord = {
  found: boolean
  outcome: ReplayOutcome | null
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

function publicFailureCode(error: unknown): string {
  if (error instanceof AppError) return error.code
  if (error instanceof Error && error.name === 'AbortError') return 'sync_timeout'
  return 'sync_failed'
}

async function postEnvelope(
  url: string,
  jws: ManagementJws,
  transport: FetchTransport,
  expectEnvelope: boolean,
): Promise<ManagementJws | null> {
  const response = await transport(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': `fellowship42-instance/${APPLICATION_VERSION}`,
    },
    body: JSON.stringify({ jws }),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new AppError(
      503,
      'operator_sync_rejected',
      `The management operator returned HTTP ${response.status}`,
    )
  }
  if (!expectEnvelope) {
    await response.body?.cancel()
    return null
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new AppError(503, 'operator_response_too_large', 'The management response exceeded the size limit')
  }
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new AppError(503, 'operator_response_too_large', 'The management response exceeded the size limit')
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new AppError(503, 'operator_response_invalid', 'The management operator returned invalid JSON')
  }
  const parsed = envelopeResponseSchema.safeParse(value)
  if (!parsed.success) {
    throw new AppError(503, 'operator_response_invalid', 'The management operator returned an invalid envelope')
  }
  return parsed.data.jws
}

async function freshEnrollmentApproval(
  env: ManagementBindings,
  connection: ActiveConnection,
  identity: StoredIdentity,
  now: number,
) : Promise<ManagementJws> {
  try {
    const payload = await verifyManagementJws(
      connection.enrollmentApproval,
      identity.publicKey,
    )
    if (
      payload.type === 'enrollment.approval' &&
      payload.connectionId === connection.connectionId &&
      Date.parse(payload.expiresAt) > now + MANAGEMENT_MAX_CLOCK_SKEW_MS
    ) {
      return connection.enrollmentApproval
    }
  } catch {
    // Rebuild from authoritative local enrollment state below.
  }
  const approvedAt = new Date(connection.approvedAt).toISOString()
  const approval = await signManagementPayload(
    {
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      type: 'enrollment.approval',
      messageId: crypto.randomUUID(),
      challengeId: connection.enrollmentChallengeId,
      connectionId: connection.connectionId,
      instanceId: connection.instanceId,
      senderKeyId: identity.keyId,
      audienceKeyId: connection.operatorKey.kid,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
      nonce: randomNonce(),
      operatorId: connection.operatorId,
      operatorKeyId: connection.operatorKey.kid,
      instanceKeyId: identity.keyId,
      grants: connection.grantSet,
      approvedAt,
    },
    await privateKey(env, identity),
  )
  await env.DB
    .prepare(
      `UPDATE management_connections SET enrollment_approval_jws_json = ?
       WHERE connection_id = ? AND approval_delivered_at IS NULL`,
    )
    .bind(JSON.stringify(approval), connection.connectionId)
    .run()
  return approval
}

async function freshRotationNotice(
  env: ManagementBindings,
  connection: ActiveConnection,
  identity: StoredIdentity,
  now: number,
): Promise<ManagementJws> {
  const replacement = connection.pendingReplacement
  const localApprovalId = connection.pendingRotationLocalApprovalId
  if (!replacement || !localApprovalId) {
    throw new AppError(
      503,
      'management_rotation_state_invalid',
      'The pending management rotation is incomplete',
    )
  }
  if (connection.pendingControlMessage) {
    try {
      const payload = await verifyManagementJws(
        connection.pendingControlMessage,
        identity.publicKey,
      )
      if (
        payload.type === 'key.rotate' &&
        payload.connectionId === connection.connectionId &&
        payload.replacementKey.kid === replacement.keyId &&
        Date.parse(payload.expiresAt) > now + MANAGEMENT_MAX_CLOCK_SKEW_MS
      ) {
        return connection.pendingControlMessage
      }
    } catch {
      // Re-sign the same locally approved replacement with the active old key.
    }
  }
  const notice = await signManagementPayload(
    {
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      type: 'key.rotate',
      messageId: crypto.randomUUID(),
      connectionId: connection.connectionId,
      instanceId: connection.instanceId,
      senderKeyId: identity.keyId,
      audienceKeyId: connection.operatorKey.kid,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
      nonce: randomNonce(),
      replacementKey: replacement.publicKey,
      activatesAt: new Date(now).toISOString(),
      previousKeyValidUntil: new Date(now + 5 * 60_000).toISOString(),
      localApprovalId,
    },
    await privateKey(env, identity),
  )
  await env.DB
    .prepare(
      `UPDATE management_connections SET pending_control_jws_json = ?
       WHERE connection_id = ? AND pending_replacement_key_id = ?`,
    )
    .bind(JSON.stringify(notice), connection.connectionId, replacement.keyId)
    .run()
  return notice
}

async function deliverPendingControlMessages(
  env: ManagementBindings,
  connection: ActiveConnection,
  identity: StoredIdentity,
  transport: FetchTransport,
  now: number,
): Promise<void> {
  if (!connection.approvalDeliveredAt) {
    const approval = await freshEnrollmentApproval(
      env,
      connection,
      identity,
      now,
    )
    await postEnvelope(connection.syncUrl, approval, transport, false)
    await env.DB
      .prepare(
        `UPDATE management_connections
         SET approval_delivered_at = ?
         WHERE connection_id = ? AND approval_delivered_at IS NULL`,
      )
      .bind(now, connection.connectionId)
      .run()
  }
  if (connection.pendingReplacement) {
    const notice = await freshRotationNotice(env, connection, identity, now)
    await postEnvelope(
      connection.syncUrl,
      notice,
      transport,
      false,
    )
    const replacement = connection.pendingReplacement
    const activated = await env.DB.batch([
      env.DB.prepare(
        `UPDATE management_identities
         SET key_id = ?, public_jwk_json = ?, private_jwk_ciphertext = ?,
             private_jwk_iv = ?, rotated_at = ?
         WHERE singleton = 1 AND key_id = ?`,
      ).bind(
        replacement.keyId,
        JSON.stringify(replacement.publicKey),
        replacement.ciphertext,
        replacement.iv,
        now,
        identity.keyId,
      ),
      env.DB.prepare(
        `UPDATE management_connections
         SET pending_control_jws_json = NULL,
             pending_rotation_local_approval_id = NULL,
             pending_replacement_key_id = NULL,
             pending_replacement_public_jwk_json = NULL,
             pending_replacement_private_jwk_ciphertext = NULL,
             pending_replacement_private_jwk_iv = NULL
         WHERE connection_id = ? AND pending_replacement_key_id = ?
           AND EXISTS (
             SELECT 1 FROM management_identities
             WHERE singleton = 1 AND key_id = ?
           )`,
      ).bind(
        connection.connectionId,
        replacement.keyId,
        replacement.keyId,
      ),
    ])
    if ((activated[0]?.meta.changes ?? 0) !== 1) {
      throw new AppError(
        409,
        'management_identity_changed',
        'The management identity changed while activating a rotation',
      )
    }
  }
}

async function activeGrants(
  db: D1Database,
  connectionId: string,
  now: number,
): Promise<Map<string, { requiresLocalApproval: boolean }>> {
  const rows = await db
    .prepare(
      `SELECT capability, requires_local_approval
       FROM management_grants
       WHERE connection_id = ? AND granted_at <= ? AND expires_at > ?`,
    )
    .bind(connectionId, now + MANAGEMENT_MAX_CLOCK_SKEW_MS, now)
    .all<{ capability: string; requires_local_approval: number }>()
  return new Map(
    rows.results.map((row) => [
      row.capability,
      { requiresLocalApproval: row.requires_local_approval === 1 },
    ]),
  )
}

async function readStoredCommand(
  db: D1Database,
  connectionId: string,
  commandId: string,
): Promise<{
  nonce: string
  payloadHash: string
  result: ManagementCommandResult
} | null> {
  const row = await db
    .prepare(
      `SELECT nonce, payload_sha256, result_json
       FROM management_command_records
       WHERE connection_id = ? AND command_id = ?`,
    )
    .bind(connectionId, commandId)
    .first<{ nonce: string; payload_sha256: string; result_json: string }>()
  return row
    ? {
        nonce: row.nonce,
        payloadHash: row.payload_sha256,
        result: managementCommandResultSchema.parse(JSON.parse(row.result_json)),
      }
    : null
}

async function instanceStatus(
  env: ManagementBindings,
): Promise<ManagementCommandResult['output']> {
  let database: 'ready' | 'degraded' | 'unavailable' = 'ready'
  let objectStorage: 'ready' | 'degraded' | 'unavailable' = 'ready'
  try {
    await env.DB.prepare('SELECT 1 AS ready').first()
  } catch {
    database = 'unavailable'
  }
  try {
    await env.MEDIA.list({ limit: 1 })
  } catch {
    objectStorage = 'unavailable'
  }
  return {
    kind: 'instance.status',
    application:
      database === 'ready' && objectStorage === 'ready'
        ? 'healthy'
        : 'degraded',
    database,
    objectStorage,
    backupFreshness: 'unknown',
  }
}

async function instanceHealth(
  env: ManagementBindings,
  instanceId: string,
  grantVersion: number,
  now: number,
): Promise<ManagementCommandResult['output']> {
  const runtime = await inspectInstanceRuntimeHealth(env)
  let objectStorage: 'ready' | 'unavailable' = 'ready'
  try {
    await env.MEDIA.list({ limit: 1 })
  } catch {
    objectStorage = 'unavailable'
  }

  let migrations: 'current' | 'pending' | 'failed' | 'unknown' = 'unknown'
  try {
    const applied = await env.DB.prepare(
      'SELECT COALESCE(MAX(id), 0) AS version FROM d1_migrations',
    ).first<{ version: number }>()
    migrations =
      applied?.version === SCHEMA_VERSION
        ? 'current'
        : (applied?.version ?? 0) < SCHEMA_VERSION
          ? 'pending'
          : 'failed'
  } catch {
    migrations = 'unknown'
  }

  const authentication =
    runtime.bootstrap.state === 'configured'
      ? 'ready'
      : ['configuration-invalid', 'identity-mismatch'].includes(
            runtime.bootstrap.state,
          )
        ? 'unavailable'
        : 'degraded'
  const outbox =
    runtime.outbox === 'clear'
      ? 'clear'
      : runtime.outbox === 'backlogged'
        ? 'backlog-small'
        : 'blocked'
  const degraded =
    runtime.status === 'degraded' ||
    objectStorage === 'unavailable' ||
    authentication !== 'ready' ||
    migrations === 'pending' ||
    migrations === 'failed'

  return {
    kind: 'instance.health',
    observation: instanceHealthObservationSchema.parse({
      formatVersion: 1,
      portableInstanceId: instanceId,
      observedAt: new Date(now).toISOString(),
      source: 'management-sync',
      overallStatus: degraded ? 'degraded' : 'healthy',
      release: {
        applicationVersion: APPLICATION_VERSION,
        schemaVersion: SCHEMA_VERSION,
        managementProtocolWireVersion: MANAGEMENT_PROTOCOL_VERSION,
      },
      connection: { status: 'connected', grantVersion },
      checks: {
        database: 'ready',
        objectStorage,
        authentication,
        migrations,
        realtime: 'unknown',
        paymentWebhooks: runtime.paymentWebhooks,
        outbox,
      },
      traffic: {
        availability: 'unknown',
        errorRate: 'unknown',
        latency: 'unknown',
        window: 'unknown',
      },
    }),
  }
}

async function evaluateCommand(
  env: ManagementBindings,
  connectionId: string,
  command: ManagementCommand,
  grants: Map<string, { requiresLocalApproval: boolean }>,
  instanceId: string,
  grantVersion: number,
  churchId: string,
  requestId: string,
  now: number,
  releaseTransport: ReleaseFetchTransport,
  operator: { id: string; displayName: string },
): Promise<ManagementCommandResult> {
  const completedAt = new Date(now).toISOString()
  if (command.instanceId !== instanceId) {
    return managementCommandResultSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: command.commandId,
      instanceId,
      commandType: command.capability,
      status: 'rejected',
      completedAt,
      error: { code: 'instance_mismatch', message: 'Command instance binding does not match' },
    })
  }
  if (
    Date.parse(command.issuedAt) > now + MANAGEMENT_MAX_CLOCK_SKEW_MS ||
    Date.parse(command.expiresAt) < now - MANAGEMENT_MAX_CLOCK_SKEW_MS
  ) {
    return managementCommandResultSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: command.commandId,
      instanceId,
      commandType: command.capability,
      status: 'rejected',
      completedAt,
      error: { code: 'command_stale', message: 'Command is outside the accepted clock window' },
    })
  }
  const grant = grants.get(command.capability)
  if (!grant) {
    return managementCommandResultSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: command.commandId,
      instanceId,
      commandType: command.capability,
      status: 'rejected',
      completedAt,
      error: { code: 'capability_not_granted', message: 'The requested capability is not granted' },
    })
  }
  if (
    grant.requiresLocalApproval &&
    command.type !== 'update.apply' &&
    command.type !== 'support.session.request'
  ) {
    return managementCommandResultSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: command.commandId,
      instanceId,
      commandType: command.capability,
      status: 'rejected',
      completedAt,
      error: { code: 'local_approval_required', message: 'This command requires a fresh local approval' },
    })
  }
  if (command.type === 'instance.status.read') {
    return managementCommandResultSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: command.commandId,
      instanceId,
      commandType: command.capability,
      status: 'succeeded',
      completedAt,
      output: await instanceStatus(env),
    })
  }
  if (command.type === 'instance.health.read') {
    return managementCommandResultSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      commandId: command.commandId,
      instanceId,
      commandType: command.capability,
      status: 'succeeded',
      completedAt,
      output: await instanceHealth(env, instanceId, grantVersion, now),
    })
  }
  try {
    if (command.type === 'update.prepare') {
      return managementCommandResultSchema.parse({
        protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
        commandId: command.commandId,
        instanceId,
        commandType: command.capability,
        status: 'succeeded',
        completedAt,
        output: {
          kind: 'update.preparation',
          preparation: await prepareUpdate(
            env,
            connectionId,
            instanceId,
            churchId,
            command,
            requestId,
            now,
            releaseTransport,
          ),
        },
      })
    }
    if (command.type === 'update.apply') {
      if (!grant.requiresLocalApproval) {
        throw new AppError(
          409,
          'update_apply_grant_invalid',
          'update.apply must require a fresh local approval',
        )
      }
      return managementCommandResultSchema.parse({
        protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
        commandId: command.commandId,
        instanceId,
        commandType: command.capability,
        status: 'succeeded',
        completedAt,
        output: {
          kind: 'update.authorization',
          authorization: await authorizePreparedUpdate(
            env,
            connectionId,
            instanceId,
            churchId,
            command,
            requestId,
            now,
          ),
        },
      })
    }
    if (command.type === 'support.session.request') {
      if (!grant.requiresLocalApproval) {
        throw new AppError(
          409,
          'support_session_grant_invalid',
          'support.session.request must require a fresh local approval',
        )
      }
      return managementCommandResultSchema.parse({
        protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
        commandId: command.commandId,
        instanceId,
        commandType: command.capability,
        status: 'succeeded',
        completedAt,
        output: await requestSupportSession(
          env.DB,
          {
            connectionId,
            instanceId,
            operatorId: operator.id,
            operatorDisplayName: operator.displayName,
          },
          command,
          churchId,
          requestId,
          now,
        ),
      })
    }
  } catch (error) {
    if (error instanceof AppError) {
      return managementCommandResultSchema.parse({
        protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
        commandId: command.commandId,
        instanceId,
        commandType: command.capability,
        status: error.status >= 500 ? 'failed' : 'rejected',
        completedAt,
        error: { code: error.code, message: error.message },
      })
    }
    throw error
  }
  return managementCommandResultSchema.parse({
    protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
    commandId: command.commandId,
    instanceId,
    commandType: command.capability,
    status: 'rejected',
    completedAt,
    error: {
      code: 'command_not_implemented',
      message: 'This command is recognized but is not implemented by this release',
    },
  })
}

async function executeCommand(
  env: ManagementBindings,
  connection: ActiveConnection,
  command: ManagementCommand,
  grants: Map<string, { requiresLocalApproval: boolean }>,
  churchId: string,
  requestId: string,
  now: number,
  releaseTransport: ReleaseFetchTransport,
): Promise<ManagementCommandResult> {
  const payloadHash = await sha256Hex(JSON.stringify(command))
  const prior = await readStoredCommand(
    env.DB,
    connection.connectionId,
    command.commandId,
  )
  if (prior) {
    if (prior.nonce !== command.nonce || prior.payloadHash !== payloadHash) {
      throw new AppError(409, 'command_replay_conflict', 'A command identifier or nonce was reused with different content')
    }
    return prior.result
  }

  const result = await evaluateCommand(
    env,
    connection.connectionId,
    command,
    grants,
    connection.instanceId,
    connection.grantVersion,
    churchId,
    requestId,
    now,
    releaseTransport,
    {
      id: connection.operatorId,
      displayName: connection.operatorDisplayName,
    },
  )
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO management_command_records (
           connection_id, command_id, nonce, payload_sha256, capability,
           command_type, status, result_json, created_at, completed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        connection.connectionId,
        command.commandId,
        command.nonce,
        payloadHash,
        command.capability,
        command.type,
        result.status,
        JSON.stringify(result),
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO audit_events (
           id, church_id, actor_user_id, action, entity_type, entity_id,
           request_id, metadata_json, occurred_at
         ) VALUES (?, ?, NULL, ?, 'management_command', ?, ?, ?, ?)`,
      ).bind(
        `management-command:${connection.connectionId}:${command.commandId}`,
        churchId,
        `management.command_${result.status}`,
        command.commandId,
        requestId,
        JSON.stringify({
          capability: command.capability,
          resultCode: result.error?.code ?? null,
        }),
        now,
      ),
    ])
    return result
  } catch {
    const raced = await readStoredCommand(
      env.DB,
      connection.connectionId,
      command.commandId,
    )
    if (
      raced &&
      raced.nonce === command.nonce &&
      raced.payloadHash === payloadHash
    ) {
      return raced.result
    }
    throw new AppError(409, 'command_replay_conflict', 'A command identifier or nonce was reused with different content')
  }
}

async function replayOutcome(
  db: D1Database,
  connection: ActiveConnection,
  senderKeyId: string,
  messageId: string,
  nonce: string,
  payloadHash: string,
): Promise<ReplayRecord> {
  const row = await db
    .prepare(
      `SELECT payload_sha256, outcome_json
       FROM management_replay_records
       WHERE connection_id = ? AND sender_key_id = ?
         AND message_id = ? AND nonce = ?`,
    )
    .bind(connection.connectionId, senderKeyId, messageId, nonce)
    .first<{ payload_sha256: string; outcome_json: string | null }>()
  if (!row) return { found: false, outcome: null }
  if (row.payload_sha256 !== payloadHash) {
    throw new AppError(409, 'message_replay_conflict', 'A signed message identifier was reused with different content')
  }
  return {
    found: true,
    outcome: row.outcome_json
      ? (JSON.parse(row.outcome_json) as ReplayOutcome)
      : null,
  }
}

async function processCommandBatch(
  env: ManagementBindings,
  connection: ActiveConnection,
  identity: StoredIdentity,
  envelope: ManagementJws,
  now: number,
  releaseTransport: ReleaseFetchTransport,
): Promise<ReplayOutcome> {
  let payload
  try {
    payload = await verifyManagementJws(envelope, connection.operatorKey)
  } catch {
    throw new AppError(403, 'operator_signature_invalid', 'The operator response signature is invalid')
  }
  if (payload.type !== 'command.batch') {
    throw new AppError(422, 'operator_message_unexpected', 'Expected a command batch')
  }
  try {
    assertFreshManagementPayload(payload, new Date(now))
  } catch {
    throw new AppError(403, 'operator_message_stale', 'The operator response is outside the accepted clock window')
  }
  if (
    payload.connectionId !== connection.connectionId ||
    payload.instanceId !== connection.instanceId ||
    payload.senderKeyId !== connection.operatorKey.kid ||
    payload.audienceKeyId !== identity.keyId
  ) {
    throw new AppError(403, 'operator_message_binding_mismatch', 'The operator response does not match this connection')
  }

  const payloadHash = await sha256Hex(JSON.stringify(envelope))
  const existing = await replayOutcome(
    env.DB,
    connection,
    payload.senderKeyId,
    payload.messageId,
    payload.nonce,
    payloadHash,
  )
  if (existing.outcome) return existing.outcome
  if (existing.found) {
    throw new AppError(
      409,
      'message_processing',
      'This signed message is already being processed',
    )
  }

  try {
    await env.DB
      .prepare(
        `INSERT INTO management_replay_records (
           connection_id, sender_key_id, message_id, nonce, payload_sha256,
           expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        connection.connectionId,
        payload.senderKeyId,
        payload.messageId,
        payload.nonce,
        payloadHash,
        Date.parse(payload.expiresAt) + MANAGEMENT_MAX_CLOCK_SKEW_MS,
        now,
      )
      .run()
  } catch {
    const raced = await replayOutcome(
      env.DB,
      connection,
      payload.senderKeyId,
      payload.messageId,
      payload.nonce,
      payloadHash,
    )
    if (raced.outcome) return raced.outcome
    throw new AppError(
      409,
      'message_processing',
      'This signed message is already being processed',
    )
  }

  const grants = await activeGrants(env.DB, connection.connectionId, now)
  const installed = await installation(env.DB)
  const results: ManagementCommandResult[] = []
  for (const command of payload.commands) {
    results.push(
      await executeCommand(
        env,
        connection,
        command,
        grants,
        installed.churchId,
        payload.messageId,
        now,
        releaseTransport,
      ),
    )
  }
  const resultPayload = {
    protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
    type: 'command.results',
    messageId: crypto.randomUUID(),
    connectionId: connection.connectionId,
    instanceId: connection.instanceId,
    senderKeyId: identity.keyId,
    audienceKeyId: connection.operatorKey.kid,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    nonce: randomNonce(),
    results,
  } as const
  const outcome: ReplayOutcome = {
    response: await signManagementPayload(
      resultPayload,
      await privateKey(env, identity),
    ),
    nextCommandCursor: payload.nextCommandCursor,
  }
  await env.DB
    .prepare(
      `UPDATE management_replay_records SET outcome_json = ?
       WHERE connection_id = ? AND sender_key_id = ?
         AND message_id = ? AND nonce = ? AND payload_sha256 = ?`,
    )
    .bind(
      JSON.stringify(outcome),
      connection.connectionId,
      payload.senderKeyId,
      payload.messageId,
      payload.nonce,
      payloadHash,
    )
    .run()
  return outcome
}

async function buildSyncRequest(
  env: ManagementBindings,
  connection: ActiveConnection,
  identity: StoredIdentity,
  now: number,
): Promise<ManagementJws> {
  return signManagementPayload(
    {
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      type: 'sync.request',
      messageId: crypto.randomUUID(),
      connectionId: connection.connectionId,
      instanceId: connection.instanceId,
      senderKeyId: identity.keyId,
      audienceKeyId: connection.operatorKey.kid,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
      nonce: randomNonce(),
      descriptor: {
        protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
        instanceId: connection.instanceId,
        topology: 'single-church',
        applicationVersion: APPLICATION_VERSION,
        schemaVersion: SCHEMA_VERSION,
        infrastructure: {
          owner: env.F42_INFRASTRUCTURE_OWNER ?? 'church',
          operator: env.F42_INSTANCE_OPERATOR ?? 'church',
        },
        capabilities: [
          'instance.status.read',
          'instance.health.read',
          'update.prepare',
          'update.apply',
        ],
      },
      grantVersion: connection.grantVersion,
      commandCursor: connection.commandCursor,
    },
    await privateKey(env, identity),
  )
}

export async function syncManagementOnce(
  env: ManagementBindings,
  now = Date.now(),
  transport: FetchTransport = fetch,
  releaseTransport: ReleaseFetchTransport = fetch,
): Promise<{ state: 'disconnected' | 'succeeded'; commandCount: number }> {
  const connection = await activeConnection(env.DB)
  if (!connection) return { state: 'disconnected', commandCount: 0 }
  let identity = await readIdentity(env.DB)
  if (!identity || identity.instanceId !== connection.instanceId) {
    throw new AppError(503, 'management_identity_missing', 'The active connection has no usable instance identity')
  }

  await deliverPendingControlMessages(env, connection, identity, transport, now)
  identity = await readIdentity(env.DB)
  if (!identity || identity.instanceId !== connection.instanceId) {
    throw new AppError(503, 'management_identity_missing', 'The active connection identity was not activated')
  }
  const request = await buildSyncRequest(env, connection, identity, now)
  const commandEnvelope = await postEnvelope(
    connection.syncUrl,
    request,
    transport,
    true,
  )
  if (!commandEnvelope) throw new Error('Expected an operator response')
  const outcome = await processCommandBatch(
    env,
    connection,
    identity,
    commandEnvelope,
    now,
    releaseTransport,
  )
  await postEnvelope(connection.syncUrl, outcome.response, transport, false)
  const decoded = await verifyManagementJws(outcome.response, identity.publicKey)
  const commandCount = decoded.type === 'command.results' ? decoded.results.length : 0
  const installed = await installation(env.DB)
  const syncRequestId = crypto.randomUUID()
  await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE management_connections
         SET last_sync_at = ?, last_sync_status = 'succeeded',
             last_sync_code = NULL, command_cursor = ?
         WHERE connection_id = ? AND status = 'active'`,
      )
      .bind(now, outcome.nextCommandCursor, connection.connectionId),
    env.DB
      .prepare('DELETE FROM management_replay_records WHERE expires_at < ?')
      .bind(now),
    env.DB
      .prepare(
        `INSERT INTO audit_events (
           id, church_id, actor_user_id, action, entity_type, entity_id,
           request_id, metadata_json, occurred_at
         ) VALUES (?, ?, NULL, 'management.sync_succeeded',
                   'management_connection', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        installed.churchId,
        connection.connectionId,
        syncRequestId,
        JSON.stringify({
          commandCount,
          commandCursor: outcome.nextCommandCursor,
        }),
        now,
      ),
  ])
  return { state: 'succeeded', commandCount }
}

export async function runScheduledManagementSync(
  env: ManagementBindings,
  now = Date.now(),
  transport: FetchTransport = fetch,
): Promise<void> {
  const connection = await activeConnection(env.DB)
  if (!connection) return
  try {
    await syncManagementOnce(env, now, transport)
  } catch (error) {
    const code = publicFailureCode(error)
    const installed = await installation(env.DB)
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE management_connections
         SET last_sync_at = ?, last_sync_status = 'failed', last_sync_code = ?
         WHERE connection_id = ? AND status = 'active'`,
      ).bind(now, code, connection.connectionId),
      env.DB.prepare(
        `INSERT INTO audit_events (
           id, church_id, actor_user_id, action, entity_type, entity_id,
           request_id, metadata_json, occurred_at
         ) VALUES (?, ?, NULL, 'management.sync_failed',
                   'management_connection', ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        installed.churchId,
        connection.connectionId,
        crypto.randomUUID(),
        JSON.stringify({ code }),
        now,
      ),
    ])
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'management.sync_failed',
        connectionId: connection.connectionId,
        code,
      }),
    )
  }
}
