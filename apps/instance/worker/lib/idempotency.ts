import type { Context } from 'hono'
import type { z } from 'zod'
import { AppError } from './errors'

/**
 * Idempotent creates for staff entry forms.
 *
 * A browser that loses the response to a create cannot know whether the record
 * was saved. It retries with the same `Idempotency-Key`, and the Worker returns
 * the record the first attempt created instead of creating another one.
 *
 * - The key is scoped to one operation, church, and actor.
 * - The request hash covers a fixed-order list of normalized fields, so key
 *   order, `null` versus omitted, and equivalent timestamp spellings cannot
 *   turn an honest retry into a conflict.
 * - The key row is written in the same D1 batch as the record and its audit
 *   and outbox evidence, and only when the record exists. A duplicate key
 *   aborts the whole batch, so a concurrent retry never adds evidence twice.
 */

const KEY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const KEY_PATTERN = /^[\x21-\x7e]{8,128}$/

/** Tables whose freshly created row proves the batch did its work. */
export type IdempotentTable =
  'contributions' | 'people' | 'households' | 'group_sessions' | 'media'

export interface IdempotencyClaim {
  readonly scope: string
  readonly key: string
  readonly requestHash: string
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Hashes a request's meaning, given as normalized fields in a fixed order. */
export function canonicalRequestHash(fields: readonly unknown[]) {
  return sha256Hex(JSON.stringify(fields))
}

/**
 * Reads the `Idempotency-Key` header for a create. Returns `null` when the
 * header is absent and the operation does not require one.
 */
export async function idempotencyClaim(
  c: Context,
  input: {
    operation: string
    churchId: string
    actorId: string
    fields: readonly unknown[]
    required?: boolean
  },
): Promise<IdempotencyClaim | null> {
  const key = c.req.header('idempotency-key')?.trim()
  if (!key) {
    if (!input.required) return null
    throw new AppError(
      422,
      'idempotency_key_required',
      'A unique Idempotency-Key header between 8 and 128 characters is required',
    )
  }
  if (!KEY_PATTERN.test(key)) {
    throw new AppError(
      422,
      'idempotency_key_invalid',
      'The Idempotency-Key header must be 8 to 128 visible ASCII characters',
    )
  }
  return {
    scope: `${input.operation}:${input.churchId}:${input.actorId}`,
    key,
    requestHash: await canonicalRequestHash(input.fields),
  }
}

/**
 * Returns the stored outcome for a key that already completed, or `null` when
 * the key is unused. A key used for a different request is a conflict. A key
 * row without a stored outcome cannot come from `commitOnce`, which writes both
 * together; if manual data repair leaves one, it is answered as a retryable
 * conflict rather than as success.
 */
export async function findReplay<T>(
  db: D1Database,
  claim: IdempotencyClaim,
  outcome: z.ZodType<T>,
): Promise<T | null> {
  const stored = await db
    .prepare(
      'SELECT request_hash, response_json FROM idempotency_keys WHERE scope = ? AND key = ?',
    )
    .bind(claim.scope, claim.key)
    .first<{ request_hash: string; response_json: string | null }>()
  if (!stored) return null
  if (stored.request_hash !== claim.requestHash) {
    throw new AppError(
      409,
      'idempotency_key_conflict',
      'This entry was already submitted with different details. Check the saved records before starting a new entry.',
    )
  }
  if (stored.response_json === null) {
    throw new AppError(
      409,
      'idempotency_in_progress',
      'This entry is still being saved. Try again shortly.',
    )
  }
  return outcome.parse(JSON.parse(stored.response_json))
}

export type CommitResult<T> =
  { replayed: false; results: D1Result[] } | { replayed: true; outcome: T }

/**
 * Runs a create batch at most once per claim. Without a claim the batch runs
 * as before. With one, the key row is appended to the batch and recorded only
 * if `proof` names a row that the batch created, so a conditional write that
 * matched nothing leaves the key unused. If another request recorded the key
 * first, this batch rolls back and the stored outcome is returned.
 */
export async function commitOnce<T>(
  db: D1Database,
  claim: IdempotencyClaim | null,
  input: {
    statements: D1PreparedStatement[]
    outcome: T
    outcomeSchema: z.ZodType<T>
    proof: { table: IdempotentTable; churchId: string; id: string }
    now: number
  },
): Promise<CommitResult<T>> {
  if (!claim) {
    return { replayed: false, results: await db.batch(input.statements) }
  }
  const recordKey = db
    .prepare(
      `
        INSERT INTO idempotency_keys (
          scope, key, request_hash, response_status, response_json, created_at, expires_at
        )
        SELECT ?, ?, ?, 201, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM ${input.proof.table} WHERE church_id = ? AND id = ?
        )
      `,
    )
    .bind(
      claim.scope,
      claim.key,
      claim.requestHash,
      JSON.stringify(input.outcome),
      input.now,
      input.now + KEY_LIFETIME_MS,
      input.proof.churchId,
      input.proof.id,
    )
  try {
    const results = await db.batch([...input.statements, recordKey])
    return { replayed: false, results: results.slice(0, -1) }
  } catch (error) {
    // A concurrent attempt with the same key may have committed first. Its key
    // row, or a natural unique column such as a person's email, then aborts
    // this batch; answer with that attempt's outcome instead of an error.
    const outcome = await findReplay(db, claim, input.outcomeSchema)
    if (outcome === null) throw error
    return { replayed: true, outcome }
  }
}
