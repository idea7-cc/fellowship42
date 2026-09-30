import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError } from '../worker/lib/errors'
import {
  canonicalRequestHash,
  commitOnce,
  findReplay,
  type IdempotencyClaim,
} from '../worker/lib/idempotency'

const outcomeSchema = z.object({ personId: z.string() })

async function claimFor(key: string, fields: unknown[]) {
  return {
    scope: 'people:create:church_demo:user_demo_owner',
    key,
    requestHash: await canonicalRequestHash(fields),
  } satisfies IdempotencyClaim
}

function insertPerson(id: string, firstName: string, now: number) {
  return env.DB.prepare(
    `
      INSERT INTO people (
        id, church_id, first_name, last_name, sort_name, version, created_at, updated_at
      ) VALUES (?, 'church_demo', ?, 'Twin', ?, 1, ?, ?)
    `,
  ).bind(id, firstName, `Twin, ${firstName}`, now, now)
}

async function peopleNamed(firstName: string) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM people WHERE first_name = ?',
  )
    .bind(firstName)
    .first<{ total: number }>()
  return row?.total ?? 0
}

describe('commitOnce', () => {
  it('rolls back a batch that loses the key to a concurrent twin and returns the twin outcome', async () => {
    const now = Date.now()
    const claim = await claimFor('twin-key-0001', ['Racer'])
    // The twin finished between this request's replay check and its batch.
    await commitOnce(env.DB, claim, {
      statements: [insertPerson('person_twin_winner', 'Racer', now)],
      outcome: { personId: 'person_twin_winner' },
      outcomeSchema,
      proof: {
        table: 'people',
        churchId: 'church_demo',
        id: 'person_twin_winner',
      },
      now,
    })

    const loser = await commitOnce(env.DB, claim, {
      statements: [
        insertPerson('person_twin_loser', 'Racer', now),
        env.DB.prepare(
          `
            INSERT INTO audit_events (
              id, church_id, action, entity_type, entity_id, request_id, occurred_at
            ) VALUES ('audit_twin_loser', 'church_demo', 'people.created', 'person', 'person_twin_loser', 'request_twin', ?)
          `,
        ).bind(now),
      ],
      outcome: { personId: 'person_twin_loser' },
      outcomeSchema,
      proof: {
        table: 'people',
        churchId: 'church_demo',
        id: 'person_twin_loser',
      },
      now,
    })

    expect(loser).toEqual({
      replayed: true,
      outcome: { personId: 'person_twin_winner' },
    })
    expect(await peopleNamed('Racer')).toBe(1)
    expect(
      await env.DB.prepare(
        `SELECT id FROM audit_events WHERE id = 'audit_twin_loser'`,
      ).first(),
    ).toBeNull()
  })

  it('reports a conflict when the twin used the key for a different request', async () => {
    const now = Date.now()
    await commitOnce(env.DB, await claimFor('twin-key-0002', ['First']), {
      statements: [insertPerson('person_twin_first', 'First', now)],
      outcome: { personId: 'person_twin_first' },
      outcomeSchema,
      proof: {
        table: 'people',
        churchId: 'church_demo',
        id: 'person_twin_first',
      },
      now,
    })
    const attempt = commitOnce(
      env.DB,
      await claimFor('twin-key-0002', ['Second']),
      {
        statements: [insertPerson('person_twin_second', 'Second', now)],
        outcome: { personId: 'person_twin_second' },
        outcomeSchema,
        proof: {
          table: 'people',
          churchId: 'church_demo',
          id: 'person_twin_second',
        },
        now,
      },
    )
    await expect(attempt).rejects.toMatchObject({
      code: 'idempotency_key_conflict',
    })
    await expect(attempt).rejects.toBeInstanceOf(AppError)
    expect(await peopleNamed('Second')).toBe(0)
  })

  it('leaves the key unused when the guarded write matched nothing', async () => {
    const now = Date.now()
    const claim = await claimFor('twin-key-0003', ['Nobody'])
    const result = await commitOnce(env.DB, claim, {
      statements: [
        env.DB.prepare(
          `
            INSERT INTO people (
              id, church_id, first_name, last_name, sort_name, version, created_at, updated_at
            )
            SELECT 'person_never', 'church_demo', 'Nobody', 'Twin', 'Twin, Nobody', 1, ?, ?
            WHERE 0
          `,
        ).bind(now, now),
      ],
      outcome: { personId: 'person_never' },
      outcomeSchema,
      proof: { table: 'people', churchId: 'church_demo', id: 'person_never' },
      now,
    })
    expect(result.replayed).toBe(false)
    expect(await findReplay(env.DB, claim, outcomeSchema)).toBeNull()
  })
})
