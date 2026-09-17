/**
 * @fellowship42/brand — Church brand presets
 *
 * A preset describes a *congregation's* visual identity, not the product's.
 * It is applied to church-facing surfaces — the member portal, a published
 * ministry page, the church header — via `themeToCSS()`.
 *
 * It deliberately does NOT repaint the operator chrome. Admin navigation,
 * tables, and forms keep the neutral Fellowship42 identity so that a
 * directory or a ledger is equally legible for every church, regardless of
 * which preset they picked. See tokens.css for the full rationale.
 *
 * ## Adding a new preset
 * 1. Pick a short, lowercase name (e.g. "ocean").
 * 2. Add it to the `BrandPresetName` union type.
 * 3. Add a `ResolvedTheme` entry to the `presets` record.
 * 4. Add to the `presetNames` array.
 * 5. Run typecheck — the compiler will catch missing cases.
 */

export type BrandPresetName =
  'warm' | 'calm' | 'bold' | 'classic' | 'modern' | 'forest' | 'royal'

export interface ChurchThemeInput {
  accent?: string | null
  bodyFont?: string | null
  headingFont?: string | null
  heroTone?: string | null
  ink?: string | null
  preset?: BrandPresetName | string | null
  radius?: string | null
  surface?: string | null
}

export interface ResolvedTheme {
  accent: string
  accentStrong: string
  /** Text color guaranteed readable on top of `accent`. Derived, never stored. */
  accentContrast: string
  bodyFont: string
  headingFont: string
  heroTone: string
  ink: string
  radius: string
  surface: string
}

/**
 * Font stacks are self-hosted-free by design: a church instance must render
 * identically offline and must not call a font CDN on every page view.
 * Each key names an intent, so the underlying stack can improve without a
 * data migration.
 */
const fontFamilies: Record<string, string> = {
  'classic-serif':
    "ui-serif, Charter, 'Iowan Old Style', 'Source Serif Pro', Georgia, 'Times New Roman', serif",
  'humanist-sans':
    "Optima, 'Gill Sans', 'Trebuchet MS', ui-sans-serif, system-ui, sans-serif",
  'modern-sans':
    "'Inter var', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'neutral-sans':
    "'Inter var', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'serif-display':
    "ui-serif, 'Iowan Old Style', Charter, 'Playfair Display', Georgia, serif",
}

const radiusValues: Record<string, string> = {
  rounded: '1.25rem',
  sharp: '0.25rem',
  soft: '0.75rem',
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const num = parseInt(full, 16)
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff }
}

function toHex({ r, g, b }: Rgb): string {
  const clamp = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel)))
  return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0')}`
}

/**
 * Darken toward black in linear-light space rather than by scaling sRGB
 * channels directly. Channel scaling desaturates and muddies mid-tones;
 * this keeps the hue intact, which matters when the result is used as the
 * hover state right next to the original.
 */
function darken(hex: string, amount = 0.2): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const scale = (channel: number) => {
    const srgb = channel / 255
    const linear =
      srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
    const scaled = linear * (1 - amount)
    const encoded =
      scaled <= 0.0031308 ? scaled * 12.92 : 1.055 * scaled ** (1 / 2.4) - 0.055
    return encoded * 255
  }
  return toHex({ r: scale(rgb.r), g: scale(rgb.g), b: scale(rgb.b) })
}

/** WCAG relative luminance. */
function luminance(rgb: Rgb): number {
  const channel = (value: number) => {
    const srgb = value / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  )
}

function ratio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * WCAG contrast ratio between two hex colors. Exported so preset changes and
 * admin-entered accents can be checked rather than eyeballed.
 * Returns 1 (the failing floor) if either color cannot be parsed.
 */
function contrastRatio(a: string, b: string): number {
  const first = parseHex(a)
  const second = parseHex(b)
  if (!first || !second) return 1
  return ratio(first, second)
}

/**
 * Pick the foreground that reads best on `background`. A church can choose
 * any accent, including a pale yellow — white text on it would be unreadable,
 * so the contrast pair is always derived rather than assumed to be white.
 */
function getAccentContrast(background: string, ink = '#101010'): string {
  const rgb = parseHex(background)
  if (!rgb) return '#ffffff'
  const white = { r: 255, g: 255, b: 255 }
  const inkRgb = parseHex(ink) ?? { r: 16, g: 16, b: 16 }
  return ratio(rgb, white) >= ratio(rgb, inkRgb) ? '#ffffff' : toHex(inkRgb)
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Every accent below clears 4.5:1 against white so button and badge text is
 * readable, and every surface clears 4.5:1 against its own ink for body copy.
 */
export const presets: Record<BrandPresetName, ResolvedTheme> = {
  warm: {
    accent: '#a8482a',
    accentStrong: '#7f3520',
    accentContrast: '#ffffff',
    bodyFont: 'classic-serif',
    headingFont: 'serif-display',
    heroTone: 'warm',
    ink: '#251710',
    radius: 'rounded',
    surface: '#faf5ee',
  },
  calm: {
    accent: '#2c6473',
    accentStrong: '#1f4a56',
    accentContrast: '#ffffff',
    bodyFont: 'humanist-sans',
    headingFont: 'humanist-sans',
    heroTone: 'calm',
    ink: '#132830',
    radius: 'soft',
    surface: '#f1f7f8',
  },
  bold: {
    accent: '#9a2f18',
    accentStrong: '#74210f',
    accentContrast: '#ffffff',
    bodyFont: 'neutral-sans',
    headingFont: 'modern-sans',
    heroTone: 'bold',
    ink: '#181210',
    radius: 'sharp',
    surface: '#f9f4f0',
  },
  classic: {
    accent: '#2a4a7c',
    accentStrong: '#1d3459',
    accentContrast: '#ffffff',
    bodyFont: 'classic-serif',
    headingFont: 'serif-display',
    heroTone: 'classic',
    ink: '#1b2033',
    radius: 'soft',
    surface: '#f2f5fa',
  },
  modern: {
    accent: '#2f3437',
    accentStrong: '#1c2022',
    accentContrast: '#ffffff',
    bodyFont: 'neutral-sans',
    headingFont: 'modern-sans',
    heroTone: 'modern',
    ink: '#16191a',
    radius: 'sharp',
    surface: '#f6f6f5',
  },
  forest: {
    accent: '#256551',
    accentStrong: '#184a3a',
    accentContrast: '#ffffff',
    bodyFont: 'humanist-sans',
    headingFont: 'humanist-sans',
    heroTone: 'forest',
    ink: '#182e26',
    radius: 'soft',
    surface: '#f0f7f3',
  },
  royal: {
    accent: '#553184',
    accentStrong: '#3d2161',
    accentContrast: '#ffffff',
    bodyFont: 'classic-serif',
    headingFont: 'serif-display',
    heroTone: 'royal',
    ink: '#221830',
    radius: 'rounded',
    surface: '#f6f2fa',
  },
}

export const presetNames: BrandPresetName[] = [
  'warm',
  'calm',
  'bold',
  'classic',
  'modern',
  'forest',
  'royal',
]

export function resolveTheme(input?: ChurchThemeInput | null): ResolvedTheme {
  const presetName = (input?.preset ?? 'warm') as BrandPresetName
  const base = presets[presetName] ?? presets.warm

  const accent = normalizeColor(input?.accent) ?? base.accent
  const ink = normalizeColor(input?.ink) ?? base.ink

  return {
    accent,
    accentStrong:
      accent === base.accent ? base.accentStrong : darken(accent, 0.28),
    accentContrast: getAccentContrast(accent, ink),
    bodyFont: input?.bodyFont || base.bodyFont,
    headingFont: input?.headingFont || base.headingFont,
    heroTone: input?.heroTone || base.heroTone,
    ink,
    radius: input?.radius || base.radius,
    surface: normalizeColor(input?.surface) ?? base.surface,
  }
}

/** Accept only well-formed hex so a bad DB value cannot break a page. */
function normalizeColor(value?: string | null): string | null {
  if (!value) return null
  const rgb = parseHex(value)
  return rgb ? toHex(rgb) : null
}

export function getFontFamily(key: string): string {
  return fontFamilies[key] ?? fontFamilies['classic-serif']
}

export function getRadiusValue(key: string): string {
  return radiusValues[key] ?? radiusValues.soft
}

export interface ThemeToCSSOptions {
  /**
   * `brand`   — publish the church identity under --church-* only. Product
   *             chrome keeps the neutral Fellowship42 palette. This is the
   *             default and the right choice for operator screens.
   *
   * `surface` — additionally remap the semantic tokens (--background, --card,
   *             --primary, --radius, fonts) so an entire region renders in the
   *             church's brand. Use for member-facing and published pages.
   */
  scope?: 'brand' | 'surface'
}

export function themeToCSS(
  theme: ResolvedTheme,
  options: ThemeToCSSOptions = {},
): Record<string, string> {
  const bodyFontFamily = getFontFamily(theme.bodyFont)
  const headingFontFamily = getFontFamily(theme.headingFont)
  const radiusValue = getRadiusValue(theme.radius)

  const churchTokens: Record<string, string> = {
    '--church-accent': theme.accent,
    '--church-accent-strong': theme.accentStrong,
    '--church-accent-contrast': theme.accentContrast,
    '--church-body-font': bodyFontFamily,
    '--church-heading-font': headingFontFamily,
    '--church-ink': theme.ink,
    '--church-radius': radiusValue,
    '--church-surface': theme.surface,
  }

  if (options.scope !== 'surface') return churchTokens

  return {
    ...churchTokens,
    '--background': theme.surface,
    '--foreground': theme.ink,
    '--card': '#ffffff',
    '--card-foreground': theme.ink,
    '--popover': '#ffffff',
    '--popover-foreground': theme.ink,
    '--muted': theme.surface,
    '--muted-foreground': mix(theme.ink, theme.surface, 0.38),
    '--accent': mix(theme.accent, theme.surface, 0.9),
    '--accent-foreground': theme.ink,
    '--primary': theme.accent,
    '--primary-foreground': theme.accentContrast,
    '--f42-primary-text': theme.accentStrong,
    '--f42-primary-hover': theme.accentStrong,
    '--f42-primary-soft': mix(theme.accent, '#ffffff', 0.88),
    '--f42-primary-soft-foreground': theme.accentStrong,
    '--f42-accent-strong': theme.accentStrong,
    '--border': mix(theme.ink, theme.surface, 0.84),
    '--f42-border-strong': mix(theme.ink, theme.surface, 0.72),
    '--input': mix(theme.ink, theme.surface, 0.76),
    '--ring': theme.accent,
    '--radius': radiusValue,
  }
}

/** Blend `color` toward `toward` by `amount` (0 = color, 1 = toward). */
function mix(color: string, toward: string, amount: number): string {
  const from = parseHex(color)
  const to = parseHex(toward)
  if (!from || !to) return color
  return toHex({
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  })
}

export { contrastRatio, darken, fontFamilies, getAccentContrast, radiusValues }
