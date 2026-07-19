import { z } from 'zod'

const CLAIM_LIMIT = 25
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000
const MAX_BACKOFF_MS = 15 * 60 * 1000

const queueMessageSchema = z
  .object({
    formatVersion: z.literal(1),
    outboxEventId: z.string().min(1).max(128),
  })
  .strict()

export type OutboxQueueMessage = z.infer<typeof queueMessageSchema>

interface PendingOutboxRow {
  id: string
  attempts: number
}

function retryDelay(attempts: number) {
  return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(attempts, 9))
}

/**
 * Claims pending D1 outbox records one at a time and publishes only an opaque
 * record ID to the instance's Queue. Church or donor payloads never cross the
 * queue binding. A scheduled invocation recovers stale claims.
 */
export async function flushOutbox(
  env: Pick<Env, 'DB' | 'OUTBOX_QUEUE'>,
  now = Date.now(),
) {
  const pending = await env.DB.prepare(
    `
      SELECT id, attempts
      FROM outbox_events
      WHERE status IN ('pending', 'failed') AND available_at <= ?
      ORDER BY available_at, created_at, id
      LIMIT ?
    `,
  )
    .bind(now, CLAIM_LIMIT)
    .all<PendingOutboxRow>()

  let published = 0
  let failed = 0
  for (const event of pending.results) {
    const claim = await env.DB.prepare(
      `
        UPDATE outbox_events
        SET status = 'processing', attempts = attempts + 1,
            processing_started_at = ?, last_error = NULL
        WHERE id = ? AND status IN ('pending', 'failed') AND available_at <= ?
      `,
    )
      .bind(now, event.id, now)
      .run()
    if ((claim.meta.changes ?? 0) !== 1) continue

    try {
      await env.OUTBOX_QUEUE.send({
        formatVersion: 1,
        outboxEventId: event.id,
      } satisfies OutboxQueueMessage)
      published += 1
    } catch {
      failed += 1
      await env.DB.prepare(
        `
          UPDATE outbox_events
          SET status = 'failed', available_at = ?, processing_started_at = NULL,
              last_error = 'queue_publish_failed'
          WHERE id = ? AND status = 'processing' AND processing_started_at = ?
        `,
      )
        .bind(now + retryDelay(event.attempts + 1), event.id, now)
        .run()
    }
  }

  return { examined: pending.results.length, published, failed }
}

export async function recoverAndFlushOutbox(
  env: Pick<Env, 'DB' | 'OUTBOX_QUEUE'>,
  now = Date.now(),
) {
  const recovered = await env.DB.prepare(
    `
      UPDATE outbox_events
      SET status = 'failed', available_at = ?, processing_started_at = NULL,
          last_error = 'processing_timeout'
      WHERE status = 'processing' AND processing_started_at < ?
    `,
  )
    .bind(now, now - PROCESSING_TIMEOUT_MS)
    .run()
  return {
    recovered: recovered.meta.changes ?? 0,
    ...(await flushOutbox(env, now)),
  }
}

export async function consumeOutbox(
  batch: MessageBatch<OutboxQueueMessage>,
  env: Pick<Env, 'DB'>,
) {
  for (const message of batch.messages) {
    const parsed = queueMessageSchema.safeParse(message.body)
    if (!parsed.success) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'outbox.invalid_queue_message',
          queueMessageId: message.id,
        }),
      )
      message.ack()
      continue
    }

    try {
      const result = await env.DB.prepare(
        `
          UPDATE outbox_events
          SET status = 'delivered', delivered_at = ?, processing_started_at = NULL,
              last_error = NULL
          WHERE id = ? AND status != 'delivered'
        `,
      )
        .bind(Date.now(), parsed.data.outboxEventId)
        .run()
      if ((result.meta.changes ?? 0) === 0) {
        const exists = await env.DB.prepare(
          'SELECT 1 AS present FROM outbox_events WHERE id = ?',
        )
          .bind(parsed.data.outboxEventId)
          .first<{ present: number }>()
        if (!exists) {
          console.error(
            JSON.stringify({
              level: 'error',
              message: 'outbox.event_not_found',
              queueMessageId: message.id,
            }),
          )
        }
      }
      message.ack()
    } catch {
      message.retry({ delaySeconds: 30 })
    }
  }
}
