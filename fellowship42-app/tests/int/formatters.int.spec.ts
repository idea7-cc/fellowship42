import { describe, expect, it } from 'vitest'

import { formatEventDate } from '@/lib/formatters'

describe('formatEventDate', () => {
  it('returns a friendly fallback for missing dates', () => {
    expect(formatEventDate(undefined)).toBe('Date pending')
  })

  it('formats valid dates for display', () => {
    expect(formatEventDate('2026-04-18T14:00:00.000Z')).toContain('2026')
  })
})

