import {
  assessReleaseUpgradeEligibility,
  releaseManifestSchema,
  updateApplyAuthorizationSchema,
  updatePreparationSchema,
  type ManagementCommand,
  type ReleaseManifest,
  type ReleaseUpgradeSource,
  type UpdateApplyAuthorization,
  type UpdatePreparation,
} from '@fellowship42/management-protocol'
import { AppError } from '../lib/errors'
import {
  APPLICATION_VERSION,
  SCHEMA_VERSION,
  currentReleaseSource,
} from '../lib/release'
import { inspectInstanceRuntimeHealth } from '../lib/runtime-health'
import type { ManagementBindings } from './service'

const MAX_RELEASE_MANIFEST_BYTES = 64 * 1024
const PREPARATION_LIFETIME_MS = 60 * 60_000
const APPROVAL_LIFETIME_MS = 30 * 60_000
const AUTHORIZATION_LIFETIME_MS = 60 * 60_000

export type ReleaseFetchTransport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type PreparationRow = {
  preparation_id: string
  instance_id: string
  connection_id: string
  source_release_tag: string
  source_manifest_sha256: string
  source_application_version: string
  source_schema_version: number
  source_wire_version: string
  target_release_tag: string
  target_manifest_sha256: string
  target_application_version: string
  target_schema_version: number
  target_wire_version: string
  required_evidence_json: string
  state: UpdatePreparation['state']
  prepared_at: number
  expires_at: number
  local_approval_id: string | null
  approved_at: number | null
  approval_expires_at: number | null
  approval_consumed_at: number | null
  authorization_id: string | null
  authorized_at: number | null
  authorization_expires_at: number | null
  applied_at: number | null
}

function iso(epoch: number): string {
  return new Date(epoch).toISOString()
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer as ArrayBuffer,
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function sourceFromRow(row: PreparationRow): ReleaseUpgradeSource {
  return {
    releaseTag: row.source_release_tag,
    releaseManifestSha256: row.source_manifest_sha256,
    applicationVersion: row.source_application_version,
    schemaVersion: row.source_schema_version,
    managementProtocolWireVersion: row.source_wire_version,
  }
}

function targetFromManifest(
  releaseTag: string,
  releaseManifestSha256: string,
  manifest: ReleaseManifest,
) {
  return {
    releaseTag,
    releaseManifestSha256,
    applicationVersion: manifest.application.version,
    schemaVersion: manifest.application.schemaVersion,
    managementProtocolWireVersion: manifest.managementProtocol.wireVersion,
  }
}

function preparationFromRow(row: PreparationRow): UpdatePreparation {
  return updatePreparationSchema.parse({
    formatVersion: 1,
    preparationId: row.preparation_id,
    instanceId: row.instance_id,
    source: sourceFromRow(row),
    target: {
      releaseTag: row.target_release_tag,
      releaseManifestSha256: row.target_manifest_sha256,
      applicationVersion: row.target_application_version,
      schemaVersion: row.target_schema_version,
      managementProtocolWireVersion: row.target_wire_version,
    },
    requiredEvidence: JSON.parse(row.required_evidence_json),
    state: row.state,
    preparedAt: iso(row.prepared_at),
    expiresAt: iso(row.expires_at),
    localApproval:
      row.local_approval_id && row.approved_at && row.approval_expires_at
        ? {
            localApprovalId: row.local_approval_id,
            approvedAt: iso(row.approved_at),
            expiresAt: iso(row.approval_expires_at),
            consumedAt: row.approval_consumed_at
              ? iso(row.approval_consumed_at)
              : null,
          }
        : null,
    authorization:
      row.authorization_id && row.authorized_at && row.authorization_expires_at
        ? {
            authorizationId: row.authorization_id,
            authorizedAt: iso(row.authorized_at),
            expiresAt: iso(row.authorization_expires_at),
          }
        : null,
    appliedAt: row.applied_at ? iso(row.applied_at) : null,
  })
}

async function readPreparation(
  db: D1Database,
  preparationId: string,
): Promise<PreparationRow | null> {
  return db
    .prepare(
      `SELECT preparation_id, instance_id, connection_id,
              source_release_tag, source_manifest_sha256,
              source_application_version, source_schema_version,
              source_wire_version, target_release_tag,
              target_manifest_sha256, target_application_version,
              target_schema_version, target_wire_version,
              required_evidence_json, state, prepared_at, expires_at,
              local_approval_id, approved_at, approval_expires_at,
              approval_consumed_at, authorization_id, authorized_at,
              authorization_expires_at, applied_at
       FROM management_update_preparations WHERE preparation_id = ?`,
    )
    .bind(preparationId)
    .first<PreparationRow>()
}

async function reconcilePreparationStates(
  env: ManagementBindings,
  now: number,
): Promise<void> {
  const configuredTag = env.F42_RELEASE_TAG?.trim() ?? ''
  const tag = configuredTag === `v${APPLICATION_VERSION}` ? configuredTag : ''
  const digest = env.F42_RELEASE_MANIFEST_SHA256?.trim() ?? ''
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE management_update_preparations
       SET state = 'applied', applied_at = ?
       WHERE state = 'authorized' AND target_release_tag = ?
         AND target_manifest_sha256 = ?`,
    ).bind(now, tag, digest),
    env.DB.prepare(
      `UPDATE management_update_preparations SET state = 'expired'
       WHERE state IN ('awaiting-local-approval', 'approved', 'authorized')
         AND (
           expires_at <= ? OR
           (state = 'approved' AND approval_expires_at <= ?) OR
           (state = 'authorized' AND authorization_expires_at <= ?)
         )`,
    ).bind(now, now, now),
  ])
}

async function downloadTargetManifest(
  releaseTag: string,
  expectedSha256: string,
  fetcher: ReleaseFetchTransport,
): Promise<{ manifest: ReleaseManifest; text: string }> {
  const url = `https://github.com/idea7-cc/fellowship42/releases/download/${releaseTag}/release-manifest.json`
  let response: Response
  try {
    response = await fetcher(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new AppError(
      503,
      'update_manifest_download_failed',
      'The target release manifest could not be downloaded',
    )
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new AppError(
      503,
      'update_manifest_download_failed',
      `The target release manifest returned HTTP ${response.status}`,
    )
  }
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_RELEASE_MANIFEST_BYTES) {
    await response.body?.cancel()
    throw new AppError(
      422,
      'update_manifest_too_large',
      'The target release manifest exceeded the size limit',
    )
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_RELEASE_MANIFEST_BYTES) {
    throw new AppError(
      422,
      'update_manifest_too_large',
      'The target release manifest exceeded the size limit',
    )
  }
  if ((await sha256Hex(bytes)) !== expectedSha256) {
    throw new AppError(
      422,
      'update_manifest_digest_mismatch',
      'The target release manifest did not match the requested digest',
    )
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new AppError(
      422,
      'update_manifest_invalid',
      'The target release manifest was not valid JSON',
    )
  }
  const parsed = releaseManifestSchema.safeParse(value)
  if (!parsed.success || `v${parsed.data.application.version}` !== releaseTag) {
    throw new AppError(
      422,
      'update_manifest_invalid',
      'The target release manifest was invalid or did not match its release tag',
    )
  }
  return { manifest: parsed.data, text }
}

async function assertUpdateReadiness(env: ManagementBindings): Promise<void> {
  const runtime = await inspectInstanceRuntimeHealth(env)
  if (runtime.status !== 'ok' || runtime.bootstrap.state !== 'configured') {
    throw new AppError(
      409,
      'update_preflight_failed',
      'The instance is not healthy enough to prepare an update',
    )
  }
  const migration = await env.DB.prepare(
    'SELECT COALESCE(MAX(id), 0) AS version FROM d1_migrations',
  ).first<{ version: number }>()
  if (migration?.version !== SCHEMA_VERSION) {
    throw new AppError(
      409,
      'update_migrations_not_current',
      'The instance schema is not current for this release',
    )
  }
  try {
    await env.MEDIA.list({ limit: 1 })
  } catch {
    throw new AppError(
      503,
      'update_storage_unavailable',
      'Object storage is unavailable',
    )
  }
}

export async function prepareUpdate(
  env: ManagementBindings,
  connectionId: string,
  instanceId: string,
  churchId: string,
  command: Extract<ManagementCommand, { type: 'update.prepare' }>,
  requestId: string,
  now: number,
  fetcher: ReleaseFetchTransport = fetch,
): Promise<UpdatePreparation> {
  await reconcilePreparationStates(env, now)
  const existing = await env.DB.prepare(
    `SELECT preparation_id FROM management_update_preparations
     WHERE connection_id = ? AND target_release_tag = ?
       AND target_manifest_sha256 = ?
       AND state IN ('awaiting-local-approval', 'approved', 'authorized', 'applied')
     ORDER BY prepared_at DESC LIMIT 1`,
  )
    .bind(
      connectionId,
      command.input.releaseTag,
      command.input.releaseManifestSha256,
    )
    .first<{ preparation_id: string }>()
  if (existing) {
    const row = await readPreparation(env.DB, existing.preparation_id)
    if (row) return preparationFromRow(row)
  }

  const source = currentReleaseSource(env)
  if (source.applicationVersion !== APPLICATION_VERSION) {
    throw new AppError(503, 'release_coordinates_invalid', 'Release coordinates are inconsistent')
  }
  await assertUpdateReadiness(env)
  const downloaded = await downloadTargetManifest(
    command.input.releaseTag,
    command.input.releaseManifestSha256,
    fetcher,
  )
  const eligibility = assessReleaseUpgradeEligibility(downloaded.manifest, source)
  if (!eligibility.eligible) {
    throw new AppError(
      409,
      eligibility.code,
      'The target release does not declare this exact source as eligible',
    )
  }
  if (
    downloaded.manifest.application.schemaVersion < SCHEMA_VERSION ||
    downloaded.manifest.upgrade?.strategy !== 'in-place-expand-contract' ||
    downloaded.manifest.upgrade.rollbackPolicy !== 'roll-forward-after-migration'
  ) {
    throw new AppError(
      409,
      'update_policy_invalid',
      'The target release does not satisfy the expand-contract roll-forward policy',
    )
  }

  const preparationId = crypto.randomUUID()
  const expiresAt = now + PREPARATION_LIFETIME_MS
  const target = targetFromManifest(
    command.input.releaseTag,
    command.input.releaseManifestSha256,
    downloaded.manifest,
  )
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE management_update_preparations SET state = 'superseded'
       WHERE connection_id = ? AND state IN ('awaiting-local-approval', 'approved')`,
    ).bind(connectionId),
    env.DB.prepare(
      `INSERT INTO management_update_preparations (
         preparation_id, instance_id, connection_id,
         source_release_tag, source_manifest_sha256,
         source_application_version, source_schema_version, source_wire_version,
         target_release_tag, target_manifest_sha256,
         target_application_version, target_schema_version, target_wire_version,
         target_manifest_json, required_evidence_json, state,
         prepared_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 'awaiting-local-approval', ?, ?)`,
    ).bind(
      preparationId,
      instanceId,
      connectionId,
      source.releaseTag,
      source.releaseManifestSha256,
      source.applicationVersion,
      source.schemaVersion,
      source.managementProtocolWireVersion,
      target.releaseTag,
      target.releaseManifestSha256,
      target.applicationVersion,
      target.schemaVersion,
      target.managementProtocolWireVersion,
      downloaded.text,
      JSON.stringify(eligibility.requiredEvidence),
      now,
      expiresAt,
    ),
    env.DB.prepare(
      `INSERT INTO audit_events (
         id, church_id, actor_user_id, action, entity_type, entity_id,
         request_id, metadata_json, occurred_at
       ) VALUES (?, ?, NULL, 'management.update_prepared',
                 'management_update', ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      churchId,
      preparationId,
      requestId,
      JSON.stringify({
        sourceReleaseTag: source.releaseTag,
        targetReleaseTag: target.releaseTag,
        targetManifestSha256: target.releaseManifestSha256,
      }),
      now,
    ),
  ])
  const row = await readPreparation(env.DB, preparationId)
  if (!row) throw new Error('Prepared update was not persisted')
  return preparationFromRow(row)
}

export async function listUpdatePreparations(
  env: ManagementBindings,
  now = Date.now(),
): Promise<UpdatePreparation[]> {
  await reconcilePreparationStates(env, now)
  const rows = await env.DB.prepare(
    `SELECT preparation_id, instance_id, connection_id,
            source_release_tag, source_manifest_sha256,
            source_application_version, source_schema_version,
            source_wire_version, target_release_tag,
            target_manifest_sha256, target_application_version,
            target_schema_version, target_wire_version,
            required_evidence_json, state, prepared_at, expires_at,
            local_approval_id, approved_at, approval_expires_at,
            approval_consumed_at, authorization_id, authorized_at,
            authorization_expires_at, applied_at
     FROM management_update_preparations
     ORDER BY prepared_at DESC LIMIT 10`,
  ).all<PreparationRow>()
  return rows.results.map(preparationFromRow)
}

export async function approveUpdatePreparation(
  env: ManagementBindings,
  preparationId: string,
  expected: { releaseTag: string; releaseManifestSha256: string },
  actorUserId: string,
  churchId: string,
  requestId: string,
  now = Date.now(),
): Promise<UpdatePreparation> {
  await reconcilePreparationStates(env, now)
  const row = await readPreparation(env.DB, preparationId)
  if (!row) throw new AppError(404, 'update_preparation_not_found', 'Update preparation not found')
  if (
    row.target_release_tag !== expected.releaseTag ||
    row.target_manifest_sha256 !== expected.releaseManifestSha256
  ) {
    throw new AppError(
      409,
      'update_approval_binding_mismatch',
      'The approval does not match the exact prepared release',
    )
  }
  if (row.state === 'approved' && row.local_approval_id) {
    return preparationFromRow(row)
  }
  if (row.state !== 'awaiting-local-approval' || row.expires_at <= now) {
    throw new AppError(
      409,
      'update_preparation_not_approvable',
      'The update preparation is no longer awaiting approval',
    )
  }
  const grant = await env.DB.prepare(
    `SELECT requires_local_approval FROM management_grants
     WHERE connection_id = ? AND capability = 'update.apply'
       AND granted_at <= ? AND expires_at > ?`,
  )
    .bind(row.connection_id, now, now)
    .first<{ requires_local_approval: number }>()
  if (grant?.requires_local_approval !== 1) {
    throw new AppError(
      409,
      'update_apply_grant_invalid',
      'A current local-approval update.apply grant is required',
    )
  }
  const localApprovalId = crypto.randomUUID()
  const approvalExpiresAt = Math.min(
    row.expires_at,
    now + APPROVAL_LIFETIME_MS,
  )
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE management_update_preparations
       SET state = 'approved', local_approval_id = ?, approved_by_user_id = ?,
           approved_at = ?, approval_expires_at = ?
       WHERE preparation_id = ? AND state = 'awaiting-local-approval'
         AND expires_at > ?`,
    ).bind(
      localApprovalId,
      actorUserId,
      now,
      approvalExpiresAt,
      preparationId,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO audit_events (
         id, church_id, actor_user_id, action, entity_type, entity_id,
         request_id, metadata_json, occurred_at
       ) VALUES (?, ?, ?, 'management.update_approved',
                 'management_update', ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      churchId,
      actorUserId,
      preparationId,
      requestId,
      JSON.stringify({
        targetReleaseTag: row.target_release_tag,
        targetManifestSha256: row.target_manifest_sha256,
        approvalExpiresAt: iso(approvalExpiresAt),
      }),
      now,
    ),
  ])
  if ((result[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'update_approval_race', 'The preparation changed while being approved')
  }
  const approved = await readPreparation(env.DB, preparationId)
  if (!approved) throw new Error('Approved update was not persisted')
  return preparationFromRow(approved)
}

export async function authorizePreparedUpdate(
  env: ManagementBindings,
  connectionId: string,
  instanceId: string,
  churchId: string,
  command: Extract<ManagementCommand, { type: 'update.apply' }>,
  requestId: string,
  now: number,
): Promise<UpdateApplyAuthorization> {
  await reconcilePreparationStates(env, now)
  const row = await readPreparation(env.DB, command.input.preparationId)
  if (!row || row.connection_id !== connectionId || row.instance_id !== instanceId) {
    throw new AppError(404, 'update_preparation_not_found', 'Update preparation not found')
  }
  if (
    row.state === 'authorized' &&
    row.local_approval_id === command.input.localApprovalId &&
    row.authorization_id &&
    row.authorized_at &&
    row.authorization_expires_at
  ) {
    return authorizationFromRow(row)
  }
  if (
    row.state !== 'approved' ||
    row.local_approval_id !== command.input.localApprovalId ||
    !row.approved_at ||
    !row.approval_expires_at ||
    row.approval_consumed_at ||
    row.approval_expires_at <= now
  ) {
    throw new AppError(
      409,
      'local_approval_invalid',
      'The exact fresh local approval is missing, expired, or already consumed',
    )
  }
  const current = currentReleaseSource(env)
  const preparedSource = sourceFromRow(row)
  if (
    current.releaseTag !== preparedSource.releaseTag ||
    current.releaseManifestSha256 !== preparedSource.releaseManifestSha256 ||
    current.applicationVersion !== preparedSource.applicationVersion ||
    current.schemaVersion !== preparedSource.schemaVersion ||
    current.managementProtocolWireVersion !==
      preparedSource.managementProtocolWireVersion
  ) {
    throw new AppError(
      409,
      'update_source_changed',
      'The installed source release changed after update preparation',
    )
  }
  const authorizationId = crypto.randomUUID()
  const authorizationExpiresAt = Math.min(
    row.expires_at,
    now + AUTHORIZATION_LIFETIME_MS,
  )
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE management_update_preparations
       SET state = 'authorized', approval_consumed_at = ?,
           authorization_id = ?, authorized_at = ?, authorization_expires_at = ?
       WHERE preparation_id = ? AND connection_id = ? AND state = 'approved'
         AND local_approval_id = ? AND approval_consumed_at IS NULL
         AND approval_expires_at > ?`,
    ).bind(
      now,
      authorizationId,
      now,
      authorizationExpiresAt,
      row.preparation_id,
      connectionId,
      command.input.localApprovalId,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO audit_events (
         id, church_id, actor_user_id, action, entity_type, entity_id,
         request_id, metadata_json, occurred_at
       ) VALUES (?, ?, NULL, 'management.update_authorized',
                 'management_update', ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      churchId,
      row.preparation_id,
      requestId,
      JSON.stringify({
        authorizationId,
        targetReleaseTag: row.target_release_tag,
        targetManifestSha256: row.target_manifest_sha256,
        authorizationExpiresAt: iso(authorizationExpiresAt),
      }),
      now,
    ),
  ])
  if ((result[0]?.meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'local_approval_race', 'The local approval was consumed concurrently')
  }
  const authorized = await readPreparation(env.DB, row.preparation_id)
  if (!authorized) throw new Error('Authorized update was not persisted')
  return authorizationFromRow(authorized)
}

function authorizationFromRow(row: PreparationRow): UpdateApplyAuthorization {
  if (
    !row.local_approval_id ||
    !row.authorization_id ||
    !row.authorized_at ||
    !row.authorization_expires_at
  ) {
    throw new Error('Update authorization row is incomplete')
  }
  return updateApplyAuthorizationSchema.parse({
    formatVersion: 1,
    authorizationId: row.authorization_id,
    preparationId: row.preparation_id,
    localApprovalId: row.local_approval_id,
    instanceId: row.instance_id,
    source: sourceFromRow(row),
    target: {
      releaseTag: row.target_release_tag,
      releaseManifestSha256: row.target_manifest_sha256,
      applicationVersion: row.target_application_version,
      schemaVersion: row.target_schema_version,
      managementProtocolWireVersion: row.target_wire_version,
    },
    strategy: 'in-place-expand-contract',
    rollbackPolicy: 'roll-forward-after-migration',
    authorizedAt: iso(row.authorized_at),
    expiresAt: iso(row.authorization_expires_at),
  })
}
