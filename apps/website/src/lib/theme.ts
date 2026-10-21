import { contrastRatio, resolveTheme, themeToCSS } from '@fellowship42/brand'

/** WCAG AA for normal-size text. */
export const AA_TEXT_CONTRAST = 4.5
/** Muted text aims a little above AA so rounding in any checker still passes. */
const MUTED_TARGET = 4.6
/** The brand's own muted blend: ink 38% of the way toward the surface. */
const BRAND_MUTED_AMOUNT = 38

/**
 * The church's Fellowship42 style preset, expressed as CSS custom properties
 * for the whole public site. Falls back to the calm "classic" preset when
 * church information is unavailable.
 *
 * The brand's muted text colour is tuned for operator screens. On the site it
 * also sits directly on the page background (notices, dates, zone notes),
 * where some presets fall below AA, so `--muted-foreground` is replaced with
 * the lightest blend of the same colours that clears AA on both the page
 * background and cards.
 */
export function churchThemeTokens(preset: string | null | undefined) {
  const theme = resolveTheme({ preset: preset ?? 'classic' })
  const tokens = themeToCSS(theme, { scope: 'surface' })
  tokens['--muted-foreground'] = readableMuted(theme.ink, theme.surface, [
    tokens['--background'],
    tokens['--card'],
  ])
  return tokens
}

export function churchThemeStyle(preset: string | null | undefined) {
  return Object.entries(churchThemeTokens(preset))
    .map(([name, value]) => `${name}:${value}`)
    .join(';')
}

/**
 * Ink blended toward `surface` as far as the brand's muted colour goes, then
 * darkened step by step until it reads at AA on every given background.
 */
export function readableMuted(
  ink: string,
  surface: string,
  backgrounds: string[],
) {
  for (let step = BRAND_MUTED_AMOUNT; step > 0; step--) {
    const color = mix(ink, surface, step / 100)
    if (backgrounds.every((bg) => contrastRatio(color, bg) >= MUTED_TARGET))
      return color
  }
  return ink
}

function channels(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** Blend `color` toward `toward` by `amount` (0 = color, 1 = toward). */
function mix(color: string, toward: string, amount: number) {
  const from = channels(color)
  const to = channels(toward)
  return `#${from
    .map((channel, index) =>
      Math.round(channel + (to[index] - channel) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}
