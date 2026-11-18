import { useState } from 'react'
import { useApiQuery } from './api'
import type { CursorPage } from './api-types'

export type ListFilters = Record<string, string | number | null | undefined>

/** What `ListPager` needs to move through a cursor-paged list. */
export interface PagerState {
  page?: CursorPage
  pageNumber: number
  onPrevious: () => void
  onNext: (cursor: string) => void
}

/**
 * One page of a cursor-paged list endpoint. The cursor trail belongs to the
 * path and filters it was built for: changing a search or filter starts again
 * at the first page in the same render, so no request goes out with a cursor
 * from a different result set, and the old trail is discarded.
 */
export function usePagedQuery<T extends { page?: CursorPage }>(
  path: string | null,
  filters: ListFilters,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '')
      params.set(key, String(value))
  }
  const listKey = path ? `${path}?${params}` : ''
  const [trail, setTrail] = useState<{
    key: string
    cursors: string[]
  }>({ key: listKey, cursors: [] })
  // A different path or filter set drops the trail outright, so returning to
  // earlier filters starts at page 1 rather than the page left behind.
  if (trail.key !== listKey) setTrail({ key: listKey, cursors: [] })
  const cursors = trail.key === listKey ? trail.cursors : []
  const cursor = cursors.at(-1)
  if (cursor) params.set('cursor', cursor)
  const query = useApiQuery<T>(path ? `${path}?${params}` : null)
  const pager: PagerState = {
    page: query.data?.page,
    pageNumber: cursors.length + 1,
    onPrevious: () => setTrail({ key: listKey, cursors: cursors.slice(0, -1) }),
    onNext: (next) => setTrail({ key: listKey, cursors: [...cursors, next] }),
  }
  return { ...query, pager }
}
