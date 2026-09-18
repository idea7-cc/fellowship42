import { eventCreateInput } from '../../../contracts/events'
import { AppError } from '../../lib/errors'
import {
  isSlugConflict,
  mutationEvidence,
  validationError,
} from '../../lib/content'
import { mapEvent } from '../../lib/records'
import { membershipPermissionGate } from '../../lib/permission-gate'
import { findEvent, validateTimezone } from './read'
export async function createEvent(
  db: D1Database,
  churchId: string,
  actor: {
    userId: string
    requestId: string
    connectionId?: string
    clientId?: string
  },
  input: unknown,
  requestKey?: string,
) {
  const parsed = eventCreateInput.safeParse(input)
  if (!parsed.success) throw validationError(parsed.error)
  const data = parsed.data
  validateTimezone(data.timezone)
  if (actor.connectionId && (data.status !== 'draft' || !requestKey))
    throw new AppError(
      403,
      'agent_publish_denied',
      'Agents may create only unpublished event drafts.',
    )
  // The normalized schema defines retry identity; pre-alpha shape changes may invalidate old retry keys.
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(data)),
      ),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
  const prior = async () => {
    if (!actor.connectionId) return null
    const row = await db
      .prepare(
        'SELECT event_id,input_hash FROM agent_event_creations WHERE church_id=? AND connection_id=? AND request_key=?',
      )
      .bind(churchId, actor.connectionId, requestKey!)
      .first<{ event_id: string; input_hash: string }>()
    if (!row) return null
    if (row.input_hash !== hash)
      throw new AppError(
        409,
        'idempotency_conflict',
        'This request key was already used with different event details. Reconcile before trying again.',
      )
    return {
      event: mapEvent(await findEvent(db, churchId, row.event_id)),
      replayed: true,
    }
  }
  // Authorization is checked before returning deduplication results as well as inside the write.
  const permission = await db
    .prepare(
      `SELECT 1 AS allowed WHERE ${membershipPermissionGate('?', 'events.write')} AND EXISTS (SELECT 1 FROM instance_metadata i JOIN churches c ON c.id=i.primary_church_id WHERE i.singleton=1 AND c.id=? AND c.deleted_at IS NULL)
    AND (? IS NULL OR EXISTS (SELECT 1 FROM agent_connections ac WHERE ac.id=? AND ac.church_id=? AND ac.user_id=? AND ac.client_id=? AND ac.revoked_at IS NULL AND ac.expires_at>? AND EXISTS (SELECT 1 FROM json_each(ac.scopes_json) WHERE value='events:write')))`,
    )
    .bind(
      churchId,
      actor.userId,
      churchId,
      actor.connectionId ?? null,
      actor.connectionId ?? null,
      churchId,
      actor.userId,
      actor.clientId ?? null,
      Date.now(),
    )
    .first()
  if (!permission)
    throw new AppError(
      403,
      'permission_denied',
      'Event creation is no longer authorized.',
    )
  const previous = await prior()
  if (previous) return previous
  const eventId = `event_${crypto.randomUUID()}`,
    operationId = crypto.randomUUID(),
    now = Date.now()
  try {
    const result = await db.batch([
      db
        .prepare(
          `INSERT INTO events (id,church_id,slug,title,status,summary,starts_at,ends_at,timezone,location,registration_url,capacity,featured,version,created_at,updated_at,last_operation_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,? WHERE ${membershipPermissionGate('?', 'events.write')}
      AND EXISTS (SELECT 1 FROM instance_metadata i JOIN churches c ON c.id=i.primary_church_id WHERE i.singleton=1 AND c.id=? AND c.deleted_at IS NULL)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM agent_connections ac WHERE ac.id=? AND ac.church_id=? AND ac.user_id=? AND ac.client_id=? AND ac.revoked_at IS NULL AND ac.expires_at>? AND EXISTS (SELECT 1 FROM json_each(ac.scopes_json) WHERE value='events:write')))
      AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM agent_event_creations WHERE church_id=? AND connection_id=? AND request_key=?))
      AND (? IS NULL OR (SELECT count(*) FROM agent_event_creations WHERE church_id=? AND connection_id=?) < 100)`,
        )
        .bind(
          eventId,
          churchId,
          data.slug,
          data.title,
          data.status,
          data.summary,
          data.startsAt,
          data.endsAt,
          data.timezone,
          data.location,
          data.registrationUrl,
          data.capacity,
          Number(data.featured),
          now,
          now,
          operationId,
          churchId,
          actor.userId,
          churchId,
          actor.connectionId ?? null,
          actor.connectionId ?? null,
          churchId,
          actor.userId,
          actor.clientId ?? null,
          now,
          actor.connectionId ?? null,
          churchId,
          actor.connectionId ?? null,
          requestKey ?? null,
          actor.connectionId ?? null,
          churchId,
          actor.connectionId ?? null,
        ),
      ...mutationEvidence(db, {
        churchId,
        actorId: actor.userId,
        requestId: actor.requestId,
        entityType: 'event',
        entityId: eventId,
        eventName: 'events.created',
        operationId,
        table: 'events',
        now,
        metadata: {
          status: data.status,
          startsAt: data.startsAt,
          ...(actor.connectionId
            ? { connectionId: actor.connectionId, clientId: actor.clientId }
            : {}),
        },
      }),
      ...(actor.connectionId
        ? [
            db
              .prepare(
                `INSERT INTO agent_event_creations(church_id,connection_id,request_key,input_hash,event_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM events WHERE church_id=? AND id=? AND last_operation_id=?)`,
              )
              .bind(
                churchId,
                actor.connectionId,
                requestKey!,
                hash,
                eventId,
                now,
                churchId,
                eventId,
                operationId,
              ),
          ]
        : []),
    ])
    if (result[0].meta.changes !== 1) {
      const retry = await prior()
      if (retry) return retry
      if (actor.connectionId) {
        const count = await db
          .prepare(
            'SELECT count(*) AS total FROM agent_event_creations WHERE church_id=? AND connection_id=?',
          )
          .bind(churchId, actor.connectionId)
          .first<{ total: number }>()
        if ((count?.total ?? 0) >= 100)
          throw new AppError(
            429,
            'draft_creation_limit',
            'This connection reached its 100-event creation limit. Review existing drafts before reconnecting.',
          )
      }
      throw new AppError(
        403,
        'permission_denied',
        'Event creation is no longer authorized.',
      )
    }
  } catch (error) {
    if (isSlugConflict(error, 'events'))
      throw new AppError(
        409,
        'event_slug_exists',
        'An event already uses this slug',
      )
    throw error
  }
  return {
    event: mapEvent(await findEvent(db, churchId, eventId)),
    replayed: false,
  }
}
