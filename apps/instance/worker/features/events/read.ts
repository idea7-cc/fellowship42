import { AppError } from '../../lib/errors'
import { escapeLike } from '../../lib/content'
import { mapEvent, type EventRow } from '../../lib/records'
import { eventListInput } from '../../../contracts/events'
import type { z } from 'zod'
export const eventSelect = `
  SELECT id, church_id, slug, title, status, summary, starts_at, ends_at,
         timezone, location, registration_url, capacity, featured, version
  FROM events
`

export function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
  } catch {
    throw new AppError(422, 'invalid_timezone', 'Choose a valid IANA timezone')
  }
}

export async function findEvent(
  db: D1Database,
  churchId: string,
  eventId: string,
) {
  const row = await db
    .prepare(
      `${eventSelect} WHERE church_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .bind(churchId, eventId)
    .first<EventRow>()
  if (!row) throw new AppError(404, 'event_not_found', 'Event not found')
  return row
}

export async function listEvents(
  db: D1Database,
  churchId: string,
  input: z.infer<typeof eventListInput>,
) {
  const conditions = ['church_id = ?', 'deleted_at IS NULL']
  const bindings: unknown[] = [churchId]
  if (input.query) {
    const pattern = `%${escapeLike(input.query)}%`
    conditions.push(`(
      title LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      summary LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      location LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`)
    bindings.push(pattern, pattern, pattern)
  }
  if (input.status) {
    conditions.push('status = ?')
    bindings.push(input.status)
  }
  if (input.cursor) {
    const cursor = await db
      .prepare(
        'SELECT starts_at, id FROM events WHERE church_id = ? AND id = ? AND deleted_at IS NULL',
      )
      .bind(churchId, input.cursor)
      .first<{ starts_at: number; id: string }>()
    if (!cursor)
      throw new AppError(422, 'invalid_cursor', 'The event cursor is invalid')
    conditions.push('(starts_at > ? OR (starts_at = ? AND id > ?))')
    bindings.push(cursor.starts_at, cursor.starts_at, cursor.id)
  }
  const result = await db
    .prepare(
      `${eventSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY starts_at, id
      LIMIT ?
    `,
    )
    .bind(...bindings, input.limit + 1)
    .all<EventRow>()
  const hasMore = result.results.length > input.limit
  const rows = hasMore ? result.results.slice(0, input.limit) : result.results
  return {
    events: rows.map(mapEvent),
    page: {
      limit: input.limit,
      nextCursor: hasMore ? rows.at(-1)!.id : null,
    },
  }
}
