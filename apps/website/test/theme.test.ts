import { describe, expect, it } from 'vitest'
import { contrastRatio, presetNames } from '@fellowship42/brand'
import {
  AA_TEXT_CONTRAST,
  churchThemeStyle,
  churchThemeTokens,
} from '../src/lib/theme'

// Every preset, the fallback used while church information is unavailable,
// and a preset name this website does not know (a newer instance's).
const cases = [...presetNames, null, 'not-a-preset'] as const

// Text the site and church blocks draw, and the backgrounds it sits on. The
// page background is the surface; header, footer, hero, and block cards are
// the card colour.
const textPairs = [
  ['--church-ink', '--background'],
  ['--church-ink', '--card'],
  ['--muted-foreground', '--background'],
  ['--muted-foreground', '--card'],
  ['--church-accent-strong', '--background'],
  ['--church-accent-strong', '--card'],
  // Navigation hover.
  ['--church-ink', '--accent'],
  // The preview banner.
  ['--church-accent-contrast', '--church-accent-strong'],
] as const

describe('church theme', () => {
  for (const preset of cases) {
    it(`clears WCAG AA for site text with the ${preset ?? 'fallback'} preset`, () => {
      const tokens = churchThemeTokens(preset)
      for (const [text, background] of textPairs) {
        const ratio = contrastRatio(tokens[text], tokens[background])
        expect(
          ratio,
          `${text} ${tokens[text]} on ${background} ${tokens[background]}`,
        ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
      }
    })
  }

  it('keeps the brand’s muted colour where it already clears AA', () => {
    // warm: mix(ink, surface, 0.38) is 4.77:1 on its surface.
    expect(churchThemeTokens('warm')['--muted-foreground']).toBe('#766b64')
  })

  it('falls back to the classic preset when church information is missing', () => {
    expect(churchThemeTokens(null)).toEqual(churchThemeTokens('classic'))
    expect(churchThemeStyle(null)).toContain('--background:#f2f5fa')
    expect(churchThemeStyle(null)).toContain('--muted-foreground:#686d7b')
  })
})
