import { z } from 'zod'
import type { CursorPage } from '../../contracts/api'
import { AppError } from './errors'

/**
 * Keyset pagination for the instance's list routes.
 *
 * A cursor carries the last row's sort value and id, not a reference to the
 * row, so renaming, unpublishing or deleting that row cannot make the next
 * page skip records or fail. It is opaque base64url JSON of
 * `[scope, value, id]`; the scope refuses a cursor from another list.
 */

export const cursorInput = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+$/)

export interface ListOrder {
  /** The SQL sort column, e.g. `p.sort_name`. */
  column: string
  /** The row property holding that column's value, e.g. `sort_name`. */
  key: string
  /** Text sorts case-insensitively; numbers compare as numbers. */
  type: 'text' | 'number'
  direction: 'asc' | 'desc'
  /** The SQL id column, e.g. `p.id`. Defaults to `id`. */
  idColumn?: string
}

type CursorValue = string | number

const invalidCursor = () =>
  new AppError(422, 'invalid_cursor', 'The list cursor is invalid')

function encodeCursor(scope: string, value: CursorValue, id: string) {
  let binary = ''
  for (const byte of new TextEncoder().encode(
    JSON.stringify([scope, value, id]),
  ))
    binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function decodeCursor(cursor: string, scope: string, type: ListOrder['type']) {
  let parsed: unknown
  try {
    const binary = atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    )
  } catch {
    throw invalidCursor()
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) throw invalidCursor()
  const [cursorScope, value, id] = parsed as unknown[]
  if (
    cursorScope !== scope ||
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > 128 ||
    (type === 'text'
      ? typeof value !== 'string'
      : typeof value !== 'number' || !Number.isFinite(value))
  )
    throw invalidCursor()
  return { value: value as CursorValue, id }
}

/**
 * The ordering, the condition for rows after `cursor`, and a function that
 * trims a `LIMIT n + 1` result to a page with the next cursor.
 */
export function listKeyset(
  scope: string,
  order: ListOrder,
  cursor: string | undefined,
) {
  const id = order.idColumn ?? 'id'
  const nocase = order.type === 'text' ? ' COLLATE NOCASE' : ''
  const past = order.direction === 'asc' ? '>' : '<'
  const after = cursor ? decodeCursor(cursor, scope, order.type) : null
  return {
    orderBy: `${order.column}${nocase} ${order.direction.toUpperCase()}, ${id}`,
    condition: after
      ? `(${order.column}${nocase} ${past} ?${nocase} OR (${order.column} = ?${nocase} AND ${id} > ?))`
      : null,
    bindings: after ? [after.value, after.value, after.id] : [],
    page<Row extends { id: string }>(
      results: Row[],
      limit: number,
    ): { rows: Row[]; page: CursorPage } {
      const rows = results.slice(0, limit)
      const last = rows.at(-1)
      return {
        rows,
        page: {
          limit,
          nextCursor:
            results.length > limit && last
              ? encodeCursor(
                  scope,
                  (last as unknown as Record<string, CursorValue>)[order.key]!,
                  last.id,
                )
              : null,
        },
      }
    },
  }
}
