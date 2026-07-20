import {
  managementCommandSchema,
  type ManagementCommand,
  type SupportSessionOperator,
  type SupportSessionScope,
} from '@fellowship42/management-protocol'
import { AppError } from '../lib/errors'

const PENDING_APPROVAL_MS = 24 * 60 * 60_000

type SupportCommand = Extract<
  ManagementCommand,
  { type: 'support.session.request' }
>

type SupportSessionRow = {
  request_id: string
  instance_id: string
  connection_id: string
  source_command_id: string
  reason: string
  requested_minutes: number
  scope: SupportSessionScope
  support_operator_id: string
  support_operator_display_name: string
  state:
    | 'awaiting-local-approval'
    | 'approved'
    | 'rejected'
    | 'revoked'
    | 'expired'
  requested_at: number
  decision_due_at: number
  decided_at: number | null
  expires_at: number | null
  revoked_at: number | null
  decision_reason: string | null
}

export type SupportSessionResource = {
  requestId: string
  connectionId: string
  reason: string
  requestedMinutes: number
  scope: SupportSessionScope
  supportOperator: SupportSessionOperator
  state: SupportSessionRow['state']
  requestedAt: string
  decisionDueAt: string
  approvedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  decisionReason: string | null
}

function resource(row: SupportSessionRow): SupportSessionResource {
  return {
    requestId: row.request_id,
    connectionId: row.connection_id,
    reason: row.reason,
    requestedMinutes: row.requested_minutes,
    scope: row.scope,
    supportOperator: {
      id: row.support_operator_id,
      displayName: row.support_operator_display_name,
    },
    state: row.state,
    requestedAt: new Date(row.requested_at).toISOString(),
    decisionDueAt: new Date(row.decision_due_at).toISOString(),
    approvedAt:
      row.decided_at && row.expires_at
        ? new Date(row.decided_at).toISOString()
        : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    decisionReason: row.decision_reason,
  }
}

async function expireSessions(db: D1Database, now: number) {
  await db.prepare(`
    UPDATE management_support_sessions SET state = 'expired'
    WHERE (state = 'awaiting-local-approval' AND decision_due_at <= ?)
       OR (state = 'approved' AND expires_at <= ?)
  `).bind(now, now).run()
}

async function sessionById(db: D1Database, requestId: string) {
  return db.prepare(`
    SELECT request_id, instance_id, connection_id, source_command_id, reason,
           requested_minutes, scope, support_operator_id,
           support_operator_display_name, state, requested_at, decision_due_at,
           decided_at, expires_at, revoked_at, decision_reason
    FROM management_support_sessions WHERE request_id = ?
  `).bind(requestId).first<SupportSessionRow>()
}

function output(row: SupportSessionRow) {
  return {
    kind: 'support.request' as const,
    requestId: row.request_id,
    state: row.state,
    scope: row.scope,
    supportOperator: {
      id: row.support_operator_id,
      displayName: row.support_operator_display_name,
    },
    requestedAt: new Date(row.requested_at).toISOString(),
    ...(row.decided_at && row.expires_at
      ? { approvedAt: new Date(row.decided_at).toISOString() }
      : {}),
    ...(row.expires_at
      ? { expiresAt: new Date(row.expires_at).toISOString() }
      : {}),
  }
}

export async function requestSupportSession(
  db: D1Database,
  connection: {
    connectionId: string
    instanceId: string
    operatorId: string
    operatorDisplayName: string
  },
  commandInput: ManagementCommand,
  churchId: string,
  managementMessageId: string,
  now = Date.now(),
) {
  const command = managementCommandSchema.parse(commandInput) as SupportCommand
  if (command.type !== 'support.session.request') {
    throw new AppError(422, 'support_command_invalid', 'Expected a support session request')
  }
  await expireSessions(db, now)
  const requestId = command.input.requestId ?? crypto.randomUUID()
  const scope = command.input.scope ?? 'operational-diagnostics'
  const supportOperator = command.input.supportOperator ?? {
    id: connection.operatorId,
    displayName: connection.operatorDisplayName,
  }
  const existing = await sessionById(db, requestId)
  if (existing) {
    if (
      existing.connection_id !== connection.connectionId ||
      existing.instance_id !== connection.instanceId ||
      existing.reason !== command.input.reason ||
      existing.requested_minutes !== command.input.requestedMinutes ||
      existing.scope !== scope ||
      existing.support_operator_id !== supportOperator.id ||
      existing.support_operator_display_name !== supportOperator.displayName
    ) {
      throw new AppError(
        409,
        'support_request_conflict',
        'The support request identifier is already bound to different details',
      )
    }
    return output(existing)
  }

  await db.batch([
    db.prepare(`
      INSERT INTO management_support_sessions (
        request_id, instance_id, connection_id, source_command_id, reason,
        requested_minutes, scope, support_operator_id,
        support_operator_display_name, state, requested_at, decision_due_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting-local-approval', ?, ?)
    `).bind(
      requestId,
      connection.instanceId,
      connection.connectionId,
      command.commandId,
      command.input.reason,
      command.input.requestedMinutes,
      scope,
      supportOperator.id,
      supportOperator.displayName,
      now,
      now + PENDING_APPROVAL_MS,
    ),
    db.prepare(`
      INSERT INTO audit_events (
        id, church_id, actor_user_id, action, entity_type, entity_id,
        request_id, metadata_json, occurred_at
      ) VALUES (?, ?, NULL, 'management.support_session_requested',
                'management_support_session', ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      churchId,
      requestId,
      managementMessageId,
      JSON.stringify({
        operatorId: supportOperator.id,
        scope,
        requestedMinutes: command.input.requestedMinutes,
      }),
      now,
    ),
  ])
  const created = await sessionById(db, requestId)
  if (!created) throw new Error('Support session request disappeared')
  return output(created)
}

export async function listSupportSessions(
  db: D1Database,
  instanceId: string,
  now = Date.now(),
) {
  await expireSessions(db, now)
  const rows = await db.prepare(`
    SELECT request_id, instance_id, connection_id, source_command_id, reason,
           requested_minutes, scope, support_operator_id,
           support_operator_display_name, state, requested_at, decision_due_at,
           decided_at, expires_at, revoked_at, decision_reason
    FROM management_support_sessions
    WHERE instance_id = ?
    ORDER BY requested_at DESC, request_id DESC LIMIT 50
  `).bind(instanceId).all<SupportSessionRow>()
  return rows.results.map(resource)
}

export async function decideSupportSession(
  db: D1Database,
  requestId: string,
  action: 'approve' | 'reject' | 'revoke',
  actorUserId: string,
  churchId: string,
  requestTraceId: string,
  reason: string | null,
  now = Date.now(),
) {
  await expireSessions(db, now)
  const prior = await sessionById(db, requestId)
  if (!prior || prior.instance_id !== (await db.prepare(
    'SELECT instance_id FROM instance_metadata WHERE singleton = 1',
  ).first<{ instance_id: string }>())?.instance_id) {
    throw new AppError(404, 'support_session_not_found', 'Support session request not found')
  }
  if (action === 'revoke') {
    if (prior.state !== 'approved') {
      throw new AppError(409, 'support_session_not_active', 'Only an active support session can be revoked')
    }
  } else if (prior.state !== 'awaiting-local-approval') {
    throw new AppError(409, 'support_session_already_decided', 'The support session request is no longer awaiting a decision')
  }
  const nextState = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revoked'
  const expiresAt = action === 'approve' ? now + prior.requested_minutes * 60_000 : prior.expires_at
  const changed = action === 'revoke'
    ? await db.prepare(`
        UPDATE management_support_sessions
        SET state = 'revoked', revoked_by_user_id = ?, revoked_at = ?,
            decision_reason = ?
        WHERE request_id = ? AND state = 'approved'
      `).bind(actorUserId, now, reason, requestId).run()
    : await db.prepare(`
        UPDATE management_support_sessions
        SET state = ?, decided_by_user_id = ?, decided_at = ?, expires_at = ?,
            decision_reason = ?
        WHERE request_id = ? AND state = 'awaiting-local-approval'
      `).bind(nextState, actorUserId, now, expiresAt, reason, requestId).run()
  if ((changed.meta.changes ?? 0) !== 1) {
    throw new AppError(409, 'support_session_changed', 'The support session changed while applying the decision')
  }
  await db.prepare(`
    INSERT INTO audit_events (
      id, church_id, actor_user_id, action, entity_type, entity_id,
      request_id, metadata_json, occurred_at
    ) VALUES (?, ?, ?, ?, 'management_support_session', ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    churchId,
    actorUserId,
    `management.support_session_${nextState}`,
    requestId,
    requestTraceId,
    JSON.stringify({ scope: prior.scope, operatorId: prior.support_operator_id }),
    now,
  ).run()
  const updated = await sessionById(db, requestId)
  if (!updated) throw new Error('Support session decision disappeared')
  return resource(updated)
}
