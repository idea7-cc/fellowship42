import type { Context } from 'hono'
import { z } from 'zod'
import { AppError } from './errors'
import type { ChurchChangeEvent } from '../realtime'

export type ContentContext = Context<{
  Bindings: Env
  Variables: {
    identity: import('./auth').AccessIdentity | null
    requestId: string
  }
}>

export const publishStatusSchema = z.enum(['draft', 'published', 'archived'])
export const versionInputSchema = z
  .object({ version: z.number().int().positive() })
  .strict()
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export function validationError(error: z.ZodError) {
  return new AppError(422, 'validation_failed', z.prettifyError(error))
}

export async function jsonBody(c: ContentContext): Promise<unknown> {
  try {
    return await c.req.json<unknown>()
  } catch {
    throw new AppError(
      400,
      'invalid_json',
      'The request body must be valid JSON',
    )
  }
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function mutationEvidence(
  db: D1Database,
  input: {
    churchId: string
    actorId: string
    requestId: string
    entityType: string
    entityId: string
    eventName: string
    operationId: string
    table: 'groups' | 'courses' | 'lessons' | 'events' | 'sermons' | 'media'
    now: number
    metadata?: Record<string, unknown>
  },
) {
  return [
    db
      .prepare(
        `
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, metadata_json, occurred_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM ${input.table}
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `,
      )
      .bind(
        crypto.randomUUID(),
        input.churchId,
        input.actorId,
        input.eventName,
        input.entityType,
        input.entityId,
        input.requestId,
        JSON.stringify(input.metadata ?? {}),
        input.now,
        input.churchId,
        input.entityId,
        input.operationId,
      ),
    db
      .prepare(
        `
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM ${input.table}
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `,
      )
      .bind(
        crypto.randomUUID(),
        input.churchId,
        input.eventName,
        input.entityType,
        input.entityId,
        JSON.stringify({ [`${input.entityType}Id`]: input.entityId }),
        input.now,
        input.now,
        input.churchId,
        input.entityId,
        input.operationId,
      ),
  ]
}

export function broadcastContent(
  c: ContentContext,
  churchId: string,
  entity: string,
  entityId: string,
  action: ChurchChangeEvent['action'],
) {
  c.executionCtx.waitUntil(
    c.env.CHURCH_ROOMS.getByName(churchId).broadcast({
      churchId,
      entity,
      entityId,
      action,
      occurredAt: Date.now(),
    }),
  )
}

export function isSlugConflict(error: unknown, table: string) {
  return (
    error instanceof Error &&
    error.message.includes(`${table}.church_id, ${table}.slug`)
  )
}
