import type { SourceState } from '@fellowship42/website-contract'

/**
 * Presentation helpers shared by the church components. They import no
 * EmDash runtime, so they are testable on their own.
 */

/** Words for visitors; operator detail goes to the log and the admin page. */
export const VISITOR_MESSAGES: Record<SourceState, string> = {
  'not-configured': 'Church information will appear here soon.',
  unavailable:
    'Church information is temporarily unavailable. Please try again shortly.',
  incompatible: 'Church information is temporarily unavailable.',
  'wrong-instance': 'Church information is temporarily unavailable.',
  unpublished: 'Church information will appear here once it is published.',
  'invalid-request':
    'That page of results is no longer available. Start again from the first page.',
}

/**
 * Query parameter for one block's page cursor. Portable Text blocks carry a
 * unique `_key`; a theme component without one falls back to its block
 * type, so two paginated components of one type on a page need distinct
 * `_key`s.
 */
export function cursorParam(type: string, key: unknown) {
  const safe =
    typeof key === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(key) ? key : type
  return `f42-${safe}`
}

const headingIds = new WeakMap<Request, Set<string>>()

/**
 * A heading id unique within one page render, so `aria-labelledby` always
 * names its own section, even when two components share a key or type.
 */
export function headingId(request: Request, type: string, key: unknown) {
  const base = `${cursorParam(type, key)}-heading`
  let used = headingIds.get(request)
  if (!used) {
    used = new Set()
    headingIds.set(request, used)
  }
  let id = base
  for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`
  used.add(id)
  return id
}
