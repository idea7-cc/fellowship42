import { resolveTheme, themeToCSS } from '@fellowship42/brand'

/**
 * The church's Fellowship42 style preset, expressed as CSS custom properties
 * for the whole public site. Falls back to the calm "classic" preset when
 * church information is unavailable.
 */
export function churchThemeStyle(preset: string | null | undefined) {
  const tokens = themeToCSS(resolveTheme({ preset: preset ?? 'classic' }), {
    scope: 'surface',
  })
  return Object.entries(tokens)
    .map(([name, value]) => `${name}:${value}`)
    .join(';')
}
