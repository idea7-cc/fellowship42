import { describe, expect, it } from 'vitest'
import { cursorParam, headingId } from './present'

describe('block identifiers', () => {
  it('pages each Portable Text block by its own key', () => {
    expect(cursorParam('f42Events', 'k3x9')).toBe('f42-k3x9')
    expect(cursorParam('f42Events', undefined)).toBe('f42-f42Events')
    expect(cursorParam('f42Events', 'not a key!')).toBe('f42-f42Events')
  })

  it('keeps heading ids unique within one page render', () => {
    const request = new Request('https://site.example/')
    expect(headingId(request, 'f42Events', undefined)).toBe(
      'f42-f42Events-heading',
    )
    expect(headingId(request, 'f42Events', undefined)).toBe(
      'f42-f42Events-heading-2',
    )
    expect(headingId(request, 'f42Events', 'this-week')).toBe(
      'f42-this-week-heading',
    )
    expect(headingId(request, 'f42Events', undefined)).toBe(
      'f42-f42Events-heading-3',
    )
    // A new request starts over.
    expect(
      headingId(new Request('https://site.example/'), 'f42Events', ''),
    ).toBe('f42-f42Events-heading')
  })
})
