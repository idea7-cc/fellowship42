import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Contribution } from '../src/lib/api-types'
import type { AccessIdentity } from '../worker/lib/auth'
import { AppError } from '../worker/lib/errors'
import {
  consumeOutbox,
  flushOutbox,
  recoverAndFlushOutbox,
  type OutboxQueueMessage,
} from '../worker/lib/outbox'
import {
  contributionRoutes,
  paymentWebhookRoutes,
} from '../worker/routes/contributions'

type PaymentEnv = Env & { PAYMENT_WEBHOOK_SECRET?: string }

const ownerIdentity: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'demo-owner-access-subject',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} as unknown as ExecutionContext

function financeApp(identity: AccessIdentity | null) {
  const app = new Hono<{
    Bindings: PaymentEnv
    Variables: { identity: AccessIdentity | null; requestId: string }
  }>()
  app.use('*', async (c, next) => {
    c.set('identity', identity)
    c.set('requestId', 'request_finance_test')
    await next()
  })
  app.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500
    return c.json(
      {
        error: {
          code: error instanceof AppError ? error.code : 'internal_error',
          message:
            error instanceof HTTPException
              ? error.message
              : 'Internal server error',
        },
      },
      status,
    )
  })
  app.route('/api/contributions', contributionRoutes)
  app.route('/webhooks/payments', paymentWebhookRoutes)
  return app
}

const ownerApp = financeApp(ownerIdentity)
const webhookApp = financeApp(null)

async function ownerRequest(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
) {
  return ownerApp.fetch(
    new Request(`https://fellowship42.test${path}`, {
      method,
      headers:
        body === undefined
          ? undefined
          : {
              'content-type': 'application/json',
              ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env as PaymentEnv,
    executionContext,
  )
}

async function signature(body: string, timestamp: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('test-webhook-secret-at-least-32-bytes'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  )
  return `v1=${[...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

async function webhookRequest(payload: unknown, overrides: HeadersInit = {}) {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  return webhookApp.fetch(
    new Request('https://fellowship42.test/webhooks/payments/testpay', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-f42-timestamp': String(timestamp),
        'x-f42-signature': await signature(body, timestamp),
        ...overrides,
      },
      body,
    }),
    env as PaymentEnv,
    executionContext,
  )
}

beforeEach(async () => {
  const now = Date.now()
  await env.DB.prepare(
    `
      INSERT OR IGNORE INTO auth_identities (
        id, user_id, provider, subject, email_at_provider, created_at, updated_at
      ) VALUES ('identity_finance_owner', 'user_demo_owner', ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      ownerIdentity.provider,
      ownerIdentity.subject,
      ownerIdentity.email,
      now,
      now,
    )
    .run()
})

describe('finance authorization and contribution integrity', () => {
  it('requires finance permissions independently from ministry permissions', async () => {
    const now = Date.now()
    const leaderIdentity: AccessIdentity = {
      provider: 'cloudflare-access',
      subject: 'finance-denied-leader',
      email: 'finance-denied@example.test',
      firstName: 'Ministry',
      lastName: 'Leader',
    }
    await env.DB.batch([
      env.DB.prepare(
        `
          INSERT INTO users (
            id, email, first_name, last_name, status, created_at, updated_at
          ) VALUES ('user_finance_denied', ?, 'Ministry', 'Leader', 'active', ?, ?)
        `,
      ).bind(leaderIdentity.email, now, now),
      env.DB.prepare(
        `
          INSERT INTO auth_identities (
            id, user_id, provider, subject, email_at_provider, created_at, updated_at
          ) VALUES ('identity_finance_denied', 'user_finance_denied', ?, ?, ?, ?, ?)
        `,
      ).bind(
        leaderIdentity.provider,
        leaderIdentity.subject,
        leaderIdentity.email,
        now,
        now,
      ),
      env.DB.prepare(
        `
          INSERT INTO church_memberships (
            id, church_id, user_id, status, joined_at, created_at, updated_at
          ) VALUES ('membership_finance_denied', 'church_demo', 'user_finance_denied',
                    'active', ?, ?, ?)
        `,
      ).bind(now, now, now),
      env.DB.prepare(
        `
          INSERT INTO membership_roles (
            church_id, membership_id, role_id, assigned_at, assigned_by_user_id
          ) VALUES ('church_demo', 'membership_finance_denied', 'role_demo_leader',
                    ?, 'user_demo_owner')
        `,
      ).bind(now),
    ])

    const response = await financeApp(leaderIdentity).fetch(
      new Request('https://fellowship42.test/api/contributions/church_demo'),
      env as PaymentEnv,
      executionContext,
    )
    expect(response.status).toBe(403)
  })

  it('records manual contributions idempotently without audit payload leakage', async () => {
    const input = {
      donorName: 'Private Donor',
      amountMinor: 12_345,
      currency: 'usd',
      fund: 'General',
      paymentMethod: 'check',
      recurring: false,
      donatedAt: '2026-07-19T18:00:00.000Z',
    }
    const first = await ownerRequest(
      'POST',
      '/api/contributions/church_demo',
      input,
      'manual-idempotency-0001',
    )
    const second = await ownerRequest(
      'POST',
      '/api/contributions/church_demo',
      input,
      'manual-idempotency-0001',
    )
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json<{ contribution: Contribution }>()
    const secondBody = await second.json<{ contribution: Contribution }>()
    expect(secondBody.contribution.id).toBe(firstBody.contribution.id)
    expect(firstBody.contribution).toMatchObject({
      amountMinor: 12_345,
      currency: 'USD',
      status: 'succeeded',
    })

    const conflict = await ownerRequest(
      'POST',
      '/api/contributions/church_demo',
      { ...input, amountMinor: 99_999 },
      'manual-idempotency-0001',
    )
    expect(conflict.status).toBe(409)

    const evidence = await env.DB.prepare(
      `
        SELECT metadata_json FROM audit_events
        WHERE entity_type = 'contribution' AND entity_id = ?
      `,
    )
      .bind(firstBody.contribution.id)
      .all<{ metadata_json: string }>()
    expect(JSON.stringify(evidence.results)).not.toContain('Private Donor')
    expect(JSON.stringify(evidence.results)).not.toContain('12345')
  })

  it('lists finance records only after authorization', async () => {
    const response = await ownerRequest(
      'GET',
      '/api/contributions/church_demo?query=Private&status=succeeded',
    )
    const body = await response.json<{ contributions: Contribution[] }>()
    expect(response.status).toBe(200)
    expect(
      body.contributions.some((entry) => entry.donorName === 'Private Donor'),
    ).toBe(true)
  })
})

describe('verified payment webhooks', () => {
  const payment = {
    formatVersion: 1,
    eventId: 'event_payment_succeeded_1',
    type: 'payment.succeeded',
    paymentId: 'payment_0001',
    donorName: 'Webhook Donor',
    amountMinor: 7_500,
    currency: 'USD',
    fund: 'Missions',
    paymentMethod: 'card',
    recurring: true,
    donatedAt: '2026-07-19T18:30:00.000Z',
  } as const

  it('rejects unsigned, stale, and incorrectly signed requests', async () => {
    const body = JSON.stringify(payment)
    const timestamp = Math.floor(Date.now() / 1000)
    const unsigned = await webhookApp.fetch(
      new Request('https://fellowship42.test/webhooks/payments/testpay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
      env as PaymentEnv,
      executionContext,
    )
    expect(unsigned.status).toBe(401)

    const invalid = await webhookRequest(payment, {
      'x-f42-signature': `v1=${'0'.repeat(64)}`,
    })
    expect(invalid.status).toBe(401)

    const staleTimestamp = timestamp - 600
    const stale = await webhookApp.fetch(
      new Request('https://fellowship42.test/webhooks/payments/testpay', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-f42-timestamp': String(staleTimestamp),
          'x-f42-signature': await signature(body, staleTimestamp),
        },
        body,
      }),
      env as PaymentEnv,
      executionContext,
    )
    expect(stale.status).toBe(401)
  })

  it('normalizes a signed event, deduplicates it, and permits a verified refund', async () => {
    const accepted = await webhookRequest(payment)
    expect(accepted.status).toBe(200)
    const acceptedBody = await accepted.json<{ contributionId: string }>()

    const duplicate = await webhookRequest(payment)
    expect(duplicate.status).toBe(200)
    await expect(duplicate.json()).resolves.toMatchObject({ duplicate: true })

    const contribution = await env.DB.prepare(
      `
        SELECT status, amount_minor, version
        FROM contributions WHERE id = ? AND church_id = 'church_demo'
      `,
    )
      .bind(acceptedBody.contributionId)
      .first<{ status: string; amount_minor: number; version: number }>()
    expect(contribution).toEqual({
      status: 'succeeded',
      amount_minor: 7_500,
      version: 1,
    })

    const storedEvent = await env.DB.prepare(
      `
        SELECT payload_json, status, request_hash, last_error
        FROM webhook_events WHERE provider = 'testpay' AND external_id = ?
      `,
    )
      .bind(payment.eventId)
      .first<{
        payload_json: string
        status: string
        request_hash: string
        last_error: string | null
      }>()
    expect(storedEvent).toMatchObject({
      payload_json: '{}',
      status: 'processed',
      last_error: null,
    })
    expect(storedEvent?.request_hash).toMatch(/^[a-f0-9]{64}$/)

    const refund = await webhookRequest({
      ...payment,
      eventId: 'event_payment_refund_1',
      type: 'payment.refunded',
    })
    expect(refund.status).toBe(200)
    const refunded = await env.DB.prepare(
      'SELECT status, version FROM contributions WHERE id = ?',
    )
      .bind(acceptedBody.contributionId)
      .first<{ status: string; version: number }>()
    expect(refunded).toEqual({ status: 'refunded', version: 2 })

    const reversal = await webhookRequest({
      ...payment,
      eventId: 'event_payment_invalid_reversal_1',
      type: 'payment.failed',
    })
    expect(reversal.status).toBe(409)
    await expect(reversal.json()).resolves.toMatchObject({
      error: { code: 'payment_state_conflict' },
    })

    const serializedEvidence = JSON.stringify(
      (
        await env.DB.prepare(
          `
            SELECT metadata_json FROM audit_events
            WHERE entity_type = 'contribution' AND entity_id = ?
          `,
        )
          .bind(acceptedBody.contributionId)
          .all()
      ).results,
    )
    expect(serializedEvidence).not.toContain('Webhook Donor')
    expect(serializedEvidence).not.toContain('7500')
  })

  it('rejects conflicting reuse of an authenticated event identity', async () => {
    const response = await webhookRequest({ ...payment, amountMinor: 7_501 })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'webhook_replay_conflict' },
    })
  })
})

describe('durable outbox delivery', () => {
  it('publishes opaque IDs, marks consumption, retries failures, and recovers stale claims', async () => {
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare(
        `
          INSERT INTO outbox_events (
            id, church_id, topic, aggregate_type, aggregate_id, payload_json,
            status, available_at, created_at
          ) VALUES ('outbox_delivery_success', 'church_demo', 'test.ready', 'test',
                    'aggregate_success', '{"private":"must-not-leave-d1"}',
                    'pending', ?, ?)
        `,
      ).bind(now, now),
      env.DB.prepare(
        `
          INSERT INTO outbox_events (
            id, church_id, topic, aggregate_type, aggregate_id, payload_json,
            status, available_at, created_at
          ) VALUES ('outbox_delivery_failure', 'church_demo', 'test.retry', 'test',
                    'aggregate_failure', '{}', 'pending', ?, ?)
        `,
      ).bind(now + 1_000, now),
      env.DB.prepare(
        `
          INSERT INTO outbox_events (
            id, church_id, topic, aggregate_type, aggregate_id, payload_json,
            status, available_at, created_at, processing_started_at
          ) VALUES ('outbox_delivery_stale', 'church_demo', 'test.recover', 'test',
                    'aggregate_stale', '{}', 'processing', ?, ?, ?)
        `,
      ).bind(now, now, now - 10 * 60 * 1000),
    ])

    const messages: OutboxQueueMessage[] = []
    const successfulQueue = {
      send(body: OutboxQueueMessage) {
        messages.push(body)
        return Promise.resolve()
      },
    } as unknown as Queue<OutboxQueueMessage>
    await flushOutbox({ DB: env.DB, OUTBOX_QUEUE: successfulQueue }, now)
    expect(messages).toContainEqual({
      formatVersion: 1,
      outboxEventId: 'outbox_delivery_success',
    })
    expect(JSON.stringify(messages)).not.toContain('must-not-leave-d1')

    let acknowledged = false
    await consumeOutbox(
      {
        queue: 'fellowship42-outbox',
        messages: [
          {
            id: 'queue-message-success',
            timestamp: new Date(),
            body: {
              formatVersion: 1,
              outboxEventId: 'outbox_delivery_success',
            },
            attempts: 1,
            ack() {
              acknowledged = true
            },
            retry() {},
          },
        ],
        ackAll() {},
        retryAll() {},
      } as unknown as MessageBatch<OutboxQueueMessage>,
      { DB: env.DB },
    )
    expect(acknowledged).toBe(true)
    const delivered = await env.DB.prepare(
      'SELECT status, delivered_at FROM outbox_events WHERE id = ?',
    )
      .bind('outbox_delivery_success')
      .first<{ status: string; delivered_at: number | null }>()
    expect(delivered?.status).toBe('delivered')
    expect(delivered?.delivered_at).toBeTypeOf('number')

    const failingQueue = {
      send() {
        return Promise.reject(new Error('provider detail must not persist'))
      },
    } as unknown as Queue<OutboxQueueMessage>
    await flushOutbox({ DB: env.DB, OUTBOX_QUEUE: failingQueue }, now + 1_000)
    const failed = await env.DB.prepare(
      `
        SELECT status, last_error, available_at
        FROM outbox_events WHERE id = 'outbox_delivery_failure'
      `,
    ).first<{ status: string; last_error: string; available_at: number }>()
    expect(failed).toMatchObject({
      status: 'failed',
      last_error: 'queue_publish_failed',
    })
    expect(failed!.available_at).toBeGreaterThan(now + 1_000)

    const recoveredMessages: OutboxQueueMessage[] = []
    const recovered = await recoverAndFlushOutbox(
      {
        DB: env.DB,
        OUTBOX_QUEUE: {
          send(body: OutboxQueueMessage) {
            recoveredMessages.push(body)
            return Promise.resolve()
          },
        } as unknown as Queue<OutboxQueueMessage>,
      },
      now,
    )
    expect(recovered.recovered).toBeGreaterThanOrEqual(1)
    expect(recoveredMessages).toContainEqual({
      formatVersion: 1,
      outboxEventId: 'outbox_delivery_stale',
    })
  })
})
