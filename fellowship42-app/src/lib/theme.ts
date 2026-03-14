import type { CSSProperties } from 'react'

type ThemeInput = {
  accent?: string | null
  surface?: string | null
  ink?: string | null
  heroTone?: string | null
  radius?: string | null
  headingFont?: string | null
  bodyFont?: string | null
}

const presetThemes: Record<string, Required<ThemeInput>> = {
  bold: {
    accent: '#9d3412',
    bodyFont: 'neutral-sans',
    headingFont: 'modern-sans',
    heroTone: 'bold',
    ink: '#171210',
    radius: 'sharp',
    surface: '#f6ede6',
  },
  calm: {
    accent: '#386c7a',
    bodyFont: 'humanist-sans',
    headingFont: 'humanist-sans',
    heroTone: 'calm',
    ink: '#11242b',
    radius: 'soft',
    surface: '#e9f4f3',
  },
  warm: {
    accent: '#b85c38',
    bodyFont: 'classic-serif',
    headingFont: 'serif-display',
    heroTone: 'warm',
    ink: '#1d120c',
    radius: 'rounded',
    surface: '#f4ede3',
  },
}

export const resolveThemeTokens = ({
  churchTheme,
  overrides,
}: {
  churchTheme?: ThemeInput & { preset?: string | null }
  overrides?: ThemeInput
}) => {
  const preset = presetThemes[churchTheme?.preset || 'warm'] ?? presetThemes.warm

  return {
    accent: overrides?.accent || churchTheme?.accent || preset.accent,
    bodyFont: overrides?.bodyFont || churchTheme?.bodyFont || preset.bodyFont,
    headingFont: overrides?.headingFont || churchTheme?.headingFont || preset.headingFont,
    heroTone: overrides?.heroTone || churchTheme?.heroTone || preset.heroTone,
    ink: overrides?.ink || churchTheme?.ink || preset.ink,
    radius: overrides?.radius || churchTheme?.radius || preset.radius,
    surface: overrides?.surface || churchTheme?.surface || preset.surface,
  }
}

export const themeStyleVars = (theme: ReturnType<typeof resolveThemeTokens>) =>
  ({
    ['--church-accent' as string]: theme.accent,
    ['--church-body-font' as string]:
      theme.bodyFont === 'neutral-sans'
        ? "'Helvetica Neue', Arial, sans-serif"
        : theme.bodyFont === 'humanist-sans'
          ? "'Trebuchet MS', 'Gill Sans', sans-serif"
          : "Georgia, 'Times New Roman', serif",
    ['--church-heading-font' as string]:
      theme.headingFont === 'modern-sans'
        ? "'Helvetica Neue', Arial, sans-serif"
        : theme.headingFont === 'humanist-sans'
          ? "'Trebuchet MS', 'Gill Sans', sans-serif"
          : "Georgia, 'Times New Roman', serif",
    ['--church-ink' as string]: theme.ink,
    ['--church-radius' as string]:
      theme.radius === 'soft' ? '18px' : theme.radius === 'sharp' ? '10px' : '28px',
    ['--church-surface' as string]: theme.surface,
  }) satisfies CSSProperties
