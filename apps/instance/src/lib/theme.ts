import type { CSSProperties } from 'react'
import type { ResolvedTheme } from '@fellowship42/brand'

// Re-export everything from the brand package
export { resolveTheme, presets, presetNames, getFontFamily, getRadiusValue } from '@fellowship42/brand'
export type { BrandPresetName, ChurchThemeInput, ResolvedTheme } from '@fellowship42/brand'

const fontFamilies: Record<string, string> = {
  'classic-serif': "Georgia, 'Times New Roman', serif",
  'humanist-sans': "'Trebuchet MS', 'Gill Sans', sans-serif",
  'modern-sans': "'Helvetica Neue', Arial, sans-serif",
  'neutral-sans': "'Helvetica Neue', Arial, sans-serif",
  'serif-display': "Georgia, 'Times New Roman', serif",
}

const radiusValues: Record<string, string> = {
  rounded: '1.75rem',
  sharp: '0.625rem',
  soft: '1.125rem',
}

export function themeToCSS(theme: ResolvedTheme): CSSProperties {
  const bodyFontFamily = fontFamilies[theme.bodyFont] ?? fontFamilies['classic-serif']
  const headingFontFamily = fontFamilies[theme.headingFont] ?? fontFamilies['serif-display']
  const radiusValue = radiusValues[theme.radius] ?? radiusValues.rounded

  return {
    ['--church-accent' as string]: theme.accent,
    ['--church-body-font' as string]: bodyFontFamily,
    ['--church-heading-font' as string]: headingFontFamily,
    ['--church-ink' as string]: theme.ink,
    ['--church-radius' as string]: radiusValue,
    ['--church-surface' as string]: theme.surface,
    ['--primary' as string]: theme.accent,
    ['--primary-foreground' as string]: '#ffffff',
    ['--f42-accent-strong' as string]: theme.accentStrong,
    ['--foreground' as string]: theme.ink,
    ['--card' as string]: theme.surface,
    ['--card-foreground' as string]: theme.ink,
    ['--ring' as string]: theme.accent,
    ['--muted' as string]: theme.surface,
    ['--radius' as string]: radiusValue,
  } satisfies CSSProperties
}
