import { Hono } from 'hono'
import { z } from 'zod'
import { requirePermission } from '../lib/auth'
import {
  broadcastContent,
  escapeLike,
  jsonBody,
  validationError,
} from '../lib/content'
import { AppError } from '../lib/errors'
import type { Contribution } from '../../src/lib/api-types'

type PaymentEnv = Env & { PAYMENT_WEBHOOK_SECRET?: string }

type AppEnv = {
  Bindings: PaymentEnv
  Variables: {
    identity: import('../lib/auth').AccessIdentity | null
    requestId: string
  }
}

interface ContributionRow {
  id: string
  church_id: string
  person_id: string | null
  donor_name: string
  amount_minor: number
  currency: string
  fund: string
  payment_method: string
  status: Contribution['status']
  recurring: number
  provider: string | null
  provider_payment_id: string | null
  donated_at: number
  created_at: number
  updated_at: number
  version: number
}

interface WebhookRow {
  status: 'received' | 'processing' | 'processed' | 'failed'
  request_hash: string | null
  processing_started_at: number | null
}

const contributionSelect = `
  SELECT id, church_id, person_id, donor_name, amount_minor, currency, fund,
         payment_method, status, recurring, provider, provider_payment_id,
         donated_at, created_at, updated_at, version
  FROM contributions
`
const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => /^[A-Z]{3}$/.test(value),
    'Use a three-letter currency code',
  )
const sharedFields = {
  donorName: z.string().trim().min(1).max(200),
  personId: z.string().trim().min(1).max(128).nullable().optional(),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: currencySchema.default('USD'),
  fund: z.string().trim().min(1).max(160),
  paymentMethod: z.string().trim().min(1).max(80),
  recurring: z.boolean().default(false),
  donatedAt: z.string().datetime({ offset: true }),
}
const manualContributionInput = z.object(sharedFields).strict()
const webhookInput = z
  .object({
    formatVersion: z.literal(1),
    eventId: z.string().trim().min(1).max(200),
    type: z.enum(['payment.succeeded', 'payment.failed', 'payment.refunded']),
    paymentId: z.string().trim().min(1).max(200),
    ...sharedFields,
  })
  .strict()
const listInput = z
  .object({
    status: z.enum(['pending', 'succeeded', 'refunded', 'failed']).optional(),
    query: z.string().trim().max(160).optional(),
    cursor: z.string().trim().min(1).max(128).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()

function mapContribution(row: ContributionRow): Contribution {
  return {
    id: row.id,
    churchId: row.church_id,
    personId: row.person_id ?? undefined,
    donorName: row.donor_name,
    amountMinor: row.amount_minor,
    currency: row.currency,
    fund: row.fund,
    paymentMethod: row.payment_method,
    status: row.status,
    recurring: row.recurring === 1,
    provider: row.provider ?? undefined,
    providerPaymentId: row.provider_payment_id ?? undefined,
    donatedAt: row.donated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function transitionAllowed(
  current: Contribution['status'],
  next: Contribution['status'],
) {
  if (current === next) return true
  if (current === 'pending') return true
  if (current === 'failed') return next === 'succeeded'
  if (current === 'succeeded') return next === 'refunded'
  return false
}

async function digestHex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hexBytes(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) return null
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  now: number,
) {
  const timestamp = Number(timestampHeader)
  if (
    !Number.isInteger(timestamp) ||
    Math.abs(Math.floor(now / 1000) - timestamp) > 300
  ) {
    throw new AppError(
      401,
      'webhook_timestamp_invalid',
      'The webhook timestamp is invalid',
    )
  }
  const signature = signatureHeader?.match(/^v1=([a-f0-9]{64})$/)?.[1]
  const signatureBytes = signature ? hexBytes(signature) : null
  if (!signatureBytes) {
    throw new AppError(
      401,
      'webhook_signature_invalid',
      'The webhook signature is invalid',
    )
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  )
  if (!verified) {
    throw new AppError(
      401,
      'webhook_signature_invalid',
      'The webhook signature is invalid',
    )
  }
}

async function requireKnownPerson(
  db: D1Database,
  churchId: string,
  personId?: string | null,
) {
  if (!personId) return
  const person = await db
    .prepare(
      'SELECT 1 AS present FROM people WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
    )
    .bind(churchId, personId)
    .first<{ present: number }>()
  if (!person)
    throw new AppError(
      422,
      'person_not_found',
      'The donor person was not found',
    )
}

export const contributionRoutes = new Hono<AppEnv>()

contributionRoutes.get('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  await requirePermission(c, churchId, 'contributions.read')
  const parsed = listInput.safeParse(c.req.query())
  if (!parsed.success) throw validationError(parsed.error)

  const conditions = ['church_id = ?']
  const bindings: unknown[] = [churchId]
  if (parsed.data.status) {
    conditions.push('status = ?')
    bindings.push(parsed.data.status)
  }
  if (parsed.data.query) {
    const query = `%${escapeLike(parsed.data.query)}%`
    conditions.push(
      "(donor_name LIKE ? ESCAPE '\\' OR fund LIKE ? ESCAPE '\\')",
    )
    bindings.push(query, query)
  }
  if (parsed.data.cursor) {
    const cursor = await c.env.DB.prepare(
      'SELECT donated_at, id FROM contributions WHERE church_id = ? AND id = ?',
    )
      .bind(churchId, parsed.data.cursor)
      .first<{ donated_at: number; id: string }>()
    if (!cursor) {
      throw new AppError(
        422,
        'invalid_cursor',
        'The contribution cursor is invalid',
      )
    }
    conditions.push('(donated_at < ? OR (donated_at = ? AND id > ?))')
    bindings.push(cursor.donated_at, cursor.donated_at, cursor.id)
  }

  const result = await c.env.DB.prepare(
    `
      ${contributionSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY donated_at DESC, id
      LIMIT ?
    `,
  )
    .bind(...bindings, parsed.data.limit + 1)
    .all<ContributionRow>()
  const hasMore = result.results.length > parsed.data.limit
  const rows = hasMore
    ? result.results.slice(0, parsed.data.limit)
    : result.results
  return c.json({
    contributions: rows.map(mapContribution),
    page: {
      limit: parsed.data.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  })
})

contributionRoutes.post('/:churchId', async (c) => {
  const churchId = c.req.param('churchId')
  const actor = await requirePermission(c, churchId, 'contributions.write')
  const parsed = manualContributionInput.safeParse(await jsonBody(c))
  if (!parsed.success) throw validationError(parsed.error)
  await requireKnownPerson(c.env.DB, churchId, parsed.data.personId)

  const idempotencyKey = c.req.header('idempotency-key')?.trim()
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128
  ) {
    throw new AppError(
      422,
      'idempotency_key_required',
      'A unique Idempotency-Key header between 8 and 128 characters is required',
    )
  }
  const scope = `contributions:create:${churchId}:${actor.id}`
  const requestHash = await digestHex(JSON.stringify(parsed.data))
  const contributionId = `contribution_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const now = Date.now()
  const donatedAt = Date.parse(parsed.data.donatedAt)
  const responseJson = JSON.stringify({ contributionId })
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `
        INSERT OR IGNORE INTO idempotency_keys (
          scope, key, request_hash, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).bind(
      scope,
      idempotencyKey,
      requestHash,
      now,
      now + 7 * 24 * 60 * 60 * 1000,
    ),
    c.env.DB.prepare(
      `
        INSERT INTO contributions (
          id, church_id, person_id, donor_name, amount_minor, currency, fund,
          payment_method, status, recurring, donated_at, created_at, updated_at,
          version, last_operation_id, created_by_user_id
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, 1, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM idempotency_keys
          WHERE scope = ? AND key = ? AND request_hash = ? AND response_json IS NULL
        )
      `,
    ).bind(
      contributionId,
      churchId,
      parsed.data.personId ?? null,
      parsed.data.donorName,
      parsed.data.amountMinor,
      parsed.data.currency,
      parsed.data.fund,
      parsed.data.paymentMethod,
      parsed.data.recurring ? 1 : 0,
      donatedAt,
      now,
      now,
      operationId,
      actor.id,
      scope,
      idempotencyKey,
      requestHash,
    ),
    c.env.DB.prepare(
      `
        INSERT INTO audit_events (
          id, church_id, actor_user_id, action, entity_type, entity_id,
          request_id, metadata_json, occurred_at
        )
        SELECT ?, ?, ?, 'contributions.created', 'contribution', ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM contributions
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `,
    ).bind(
      crypto.randomUUID(),
      churchId,
      actor.id,
      contributionId,
      c.get('requestId'),
      JSON.stringify({ source: 'manual', status: 'succeeded' }),
      now,
      churchId,
      contributionId,
      operationId,
    ),
    c.env.DB.prepare(
      `
        INSERT INTO outbox_events (
          id, church_id, topic, aggregate_type, aggregate_id, payload_json,
          status, available_at, created_at
        )
        SELECT ?, ?, 'contributions.created', 'contribution', ?, ?, 'pending', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM contributions
          WHERE church_id = ? AND id = ? AND last_operation_id = ?
        )
      `,
    ).bind(
      crypto.randomUUID(),
      churchId,
      contributionId,
      JSON.stringify({ contributionId }),
      now,
      now,
      churchId,
      contributionId,
      operationId,
    ),
    c.env.DB.prepare(
      `
        UPDATE idempotency_keys
        SET response_status = 201, response_json = ?
        WHERE scope = ? AND key = ? AND request_hash = ? AND response_json IS NULL
          AND EXISTS (
            SELECT 1 FROM contributions
            WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
      `,
    ).bind(
      responseJson,
      scope,
      idempotencyKey,
      requestHash,
      churchId,
      contributionId,
      operationId,
    ),
  ])

  let canonicalId = contributionId
  if ((results[1]?.meta.changes ?? 0) !== 1) {
    const stored = await c.env.DB.prepare(
      'SELECT request_hash, response_json FROM idempotency_keys WHERE scope = ? AND key = ?',
    )
      .bind(scope, idempotencyKey)
      .first<{ request_hash: string; response_json: string | null }>()
    if (!stored || stored.request_hash !== requestHash) {
      throw new AppError(
        409,
        'idempotency_key_conflict',
        'This idempotency key was already used for a different contribution',
      )
    }
    canonicalId = z
      .object({ contributionId: z.string() })
      .parse(JSON.parse(stored.response_json ?? '{}')).contributionId
  } else {
    broadcastContent(c, churchId, 'contribution', contributionId, 'created')
  }

  const contribution = await c.env.DB.prepare(
    `${contributionSelect} WHERE church_id = ? AND id = ?`,
  )
    .bind(churchId, canonicalId)
    .first<ContributionRow>()
  if (!contribution)
    throw new AppError(500, 'contribution_missing', 'Contribution not found')
  return c.json({ contribution: mapContribution(contribution) }, 201)
})

export const paymentWebhookRoutes = new Hono<AppEnv>()

paymentWebhookRoutes.post('/:provider', async (c) => {
  const provider = c.req.param('provider')
  const configuredProvider = c.env.PAYMENT_WEBHOOK_PROVIDER.trim()
  const secret = c.env.PAYMENT_WEBHOOK_SECRET?.trim()
  if (!configuredProvider || !secret || secret.length < 32) {
    throw new AppError(
      503,
      'payment_webhook_unconfigured',
      'Payment webhooks are not configured',
    )
  }
  if (provider !== configuredProvider) {
    throw new AppError(
      404,
      'payment_provider_not_found',
      'Payment provider not found',
    )
  }

  const rawBody = await c.req.text()
  const now = Date.now()
  await verifyWebhookSignature(
    secret,
    rawBody,
    c.req.header('x-f42-timestamp'),
    c.req.header('x-f42-signature'),
    now,
  )
  let unknown: unknown
  try {
    unknown = JSON.parse(rawBody)
  } catch {
    throw new AppError(
      400,
      'invalid_json',
      'The request body must be valid JSON',
    )
  }
  const parsed = webhookInput.safeParse(unknown)
  if (!parsed.success) throw validationError(parsed.error)

  const instance = await c.env.DB.prepare(
    'SELECT primary_church_id FROM instance_metadata WHERE singleton = 1',
  ).first<{ primary_church_id: string }>()
  if (!instance)
    throw new AppError(
      503,
      'instance_not_configured',
      'Instance setup is incomplete',
    )
  const churchId = instance.primary_church_id
  await requireKnownPerson(c.env.DB, churchId, parsed.data.personId)
  const requestHash = await digestHex(rawBody)
  await c.env.DB.prepare(
    `
      INSERT OR IGNORE INTO webhook_events (
        id, provider, external_id, event_type, payload_json, status, attempts,
        received_at, church_id, request_hash
      ) VALUES (?, ?, ?, ?, '{}', 'received', 0, ?, ?, ?)
    `,
  )
    .bind(
      `webhook_${crypto.randomUUID()}`,
      provider,
      parsed.data.eventId,
      parsed.data.type,
      now,
      churchId,
      requestHash,
    )
    .run()

  const event = await c.env.DB.prepare(
    `
      SELECT status, request_hash, processing_started_at
      FROM webhook_events WHERE provider = ? AND external_id = ?
    `,
  )
    .bind(provider, parsed.data.eventId)
    .first<WebhookRow>()
  if (!event || event.request_hash !== requestHash) {
    throw new AppError(
      409,
      'webhook_replay_conflict',
      'The webhook event ID was already used with different content',
    )
  }
  if (event.status === 'processed')
    return c.json({ accepted: true, duplicate: true })

  const claim = await c.env.DB.prepare(
    `
      UPDATE webhook_events
      SET status = 'processing', attempts = attempts + 1,
          processing_started_at = ?, last_error = NULL
      WHERE provider = ? AND external_id = ? AND request_hash = ?
        AND (
          status IN ('received', 'failed')
          OR (status = 'processing' AND processing_started_at < ?)
        )
    `,
  )
    .bind(now, provider, parsed.data.eventId, requestHash, now - 60_000)
    .run()
  if ((claim.meta.changes ?? 0) !== 1) {
    return c.json({ accepted: true, processing: true }, 202)
  }

  const status = parsed.data.type.replace(
    'payment.',
    '',
  ) as Contribution['status']
  const existing = await c.env.DB.prepare(
    `${contributionSelect} WHERE church_id = ? AND provider = ? AND provider_payment_id = ?`,
  )
    .bind(churchId, provider, parsed.data.paymentId)
    .first<ContributionRow>()
  if (
    existing &&
    (existing.amount_minor !== parsed.data.amountMinor ||
      existing.currency !== parsed.data.currency ||
      existing.fund !== parsed.data.fund ||
      existing.donor_name !== parsed.data.donorName ||
      (existing.person_id ?? null) !== (parsed.data.personId ?? null))
  ) {
    await c.env.DB.prepare(
      `
        UPDATE webhook_events
        SET status = 'failed', processing_started_at = NULL,
            last_error = 'payment_invariant_conflict'
        WHERE provider = ? AND external_id = ? AND request_hash = ?
      `,
    )
      .bind(provider, parsed.data.eventId, requestHash)
      .run()
    throw new AppError(
      409,
      'payment_invariant_conflict',
      'The payment identity conflicts with an existing contribution',
    )
  }
  if (existing && !transitionAllowed(existing.status, status)) {
    await c.env.DB.prepare(
      `
        UPDATE webhook_events
        SET status = 'failed', processing_started_at = NULL,
            last_error = 'payment_state_conflict'
        WHERE provider = ? AND external_id = ? AND request_hash = ?
      `,
    )
      .bind(provider, parsed.data.eventId, requestHash)
      .run()
    throw new AppError(
      409,
      'payment_state_conflict',
      'The payment event would reverse a completed payment state',
    )
  }

  const contributionId = existing?.id ?? `contribution_${crypto.randomUUID()}`
  const operationId = crypto.randomUUID()
  const donatedAt = Date.parse(parsed.data.donatedAt)
  const write = existing
    ? c.env.DB.prepare(
        `
          UPDATE contributions
          SET status = ?, payment_method = ?, recurring = ?, donated_at = ?,
              updated_at = ?, version = version + 1, last_operation_id = ?
          WHERE church_id = ? AND id = ? AND version = ?
        `,
      ).bind(
        status,
        parsed.data.paymentMethod,
        parsed.data.recurring ? 1 : 0,
        donatedAt,
        now,
        operationId,
        churchId,
        contributionId,
        existing.version,
      )
    : c.env.DB.prepare(
        `
          INSERT INTO contributions (
            id, church_id, person_id, donor_name, amount_minor, currency, fund,
            payment_method, status, recurring, provider, provider_payment_id,
            donated_at, created_at, updated_at, version, last_operation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `,
      ).bind(
        contributionId,
        churchId,
        parsed.data.personId ?? null,
        parsed.data.donorName,
        parsed.data.amountMinor,
        parsed.data.currency,
        parsed.data.fund,
        parsed.data.paymentMethod,
        status,
        parsed.data.recurring ? 1 : 0,
        provider,
        parsed.data.paymentId,
        donatedAt,
        now,
        now,
        operationId,
      )

  try {
    const results = await c.env.DB.batch([
      write,
      c.env.DB.prepare(
        `
          INSERT INTO audit_events (
            id, church_id, action, entity_type, entity_id, request_id,
            metadata_json, occurred_at
          )
          SELECT ?, ?, 'contributions.payment-received', 'contribution', ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM contributions
            WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
        `,
      ).bind(
        crypto.randomUUID(),
        churchId,
        contributionId,
        c.get('requestId'),
        JSON.stringify({ provider, status }),
        now,
        churchId,
        contributionId,
        operationId,
      ),
      c.env.DB.prepare(
        `
          INSERT INTO outbox_events (
            id, church_id, topic, aggregate_type, aggregate_id, payload_json,
            status, available_at, created_at
          )
          SELECT ?, ?, 'contributions.payment-received', 'contribution', ?, ?,
                 'pending', ?, ?
          WHERE EXISTS (
            SELECT 1 FROM contributions
            WHERE church_id = ? AND id = ? AND last_operation_id = ?
          )
        `,
      ).bind(
        crypto.randomUUID(),
        churchId,
        contributionId,
        JSON.stringify({ contributionId }),
        now,
        now,
        churchId,
        contributionId,
        operationId,
      ),
      c.env.DB.prepare(
        `
          UPDATE webhook_events
          SET status = 'processed', processed_at = ?, processing_started_at = NULL,
              last_error = NULL
          WHERE provider = ? AND external_id = ? AND request_hash = ?
            AND status = 'processing'
            AND EXISTS (
              SELECT 1 FROM contributions
              WHERE church_id = ? AND id = ? AND last_operation_id = ?
            )
        `,
      ).bind(
        now,
        provider,
        parsed.data.eventId,
        requestHash,
        churchId,
        contributionId,
        operationId,
      ),
    ])
    if (
      (results[0]?.meta.changes ?? 0) !== 1 ||
      (results[3]?.meta.changes ?? 0) !== 1
    ) {
      throw new Error('payment_write_conflict')
    }
  } catch {
    await c.env.DB.prepare(
      `
        UPDATE webhook_events
        SET status = 'failed', processing_started_at = NULL,
            last_error = 'payment_processing_failed'
        WHERE provider = ? AND external_id = ? AND request_hash = ?
          AND status = 'processing'
      `,
    )
      .bind(provider, parsed.data.eventId, requestHash)
      .run()
    throw new AppError(
      503,
      'payment_processing_failed',
      'The payment event could not be processed',
    )
  }

  broadcastContent(
    c,
    churchId,
    'contribution',
    contributionId,
    existing ? 'updated' : 'created',
  )
  return c.json({ accepted: true, contributionId })
})
