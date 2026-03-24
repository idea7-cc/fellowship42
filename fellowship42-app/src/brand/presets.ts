/**
 * Fellowship42 — Church brand presets
 *
 * Each preset defines a complete visual personality that a church can select
 * in the admin panel. Individual tokens can still be overridden per-church.
 *
 * This module is intentionally framework-agnostic: it exports plain objects
 * and a CSS-variable resolver so the same presets can be consumed by
 * Next.js, Astro, or any other rendering layer.
 *
 * ## Adding a new preset
 * 1. Pick a short, lowercase name (e.g. "ocean").
 * 2. Add it to the `BrandPresetName` union type.
 * 3. Add a `ResolvedTheme` entry to the `presets` record below.
 * 4. Add a matching option in `src/collections/Churches.ts` (preset + heroTone selects).
 * 5. Run `npm run typecheck` — the compiler will catch anything you missed.
 */

import type { CSSProperties } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type BrandPresetName =
  | 'warm'
  | 'calm'
  | 'bold'
  | 'classic'
  | 'modern'
  | 'forest'
  | 'royal'

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
  bodyFont: string
  headingFont: string
  heroTone: string
  ink: string
  radius: string
  surface: string
}

/* ------------------------------------------------------------------ */
/* Font family maps                                                    */
/* ------------------------------------------------------------------ */

export const fontFamilies: Record<string, string> = {
  'classic-serif': "Georgia, 'Times New Roman', serif",
  'humanist-sans': "'Trebuchet MS', 'Gill Sans', sans-serif",
  'modern-sans': "'Helvetica Neue', Arial, sans-serif",
  'neutral-sans': "'Helvetica Neue', Arial, sans-serif",
  'serif-display': "Georgia, 'Times New Roman', serif",
}

export const radiusValues: Record<string, string> = {
  rounded: '1.75rem',
  sharp: '0.625rem',
  soft: '1.125rem',
}

/* ------------------------------------------------------------------ */
/* Color utility                                                       */
/* ------------------------------------------------------------------ */

export function darken(hex: string, amount = 0.2): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - amount)))
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - amount)))
  const b = Math.max(0, Math.round((num & 0xff) * (1 - amount)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/* ------------------------------------------------------------------ */
/* 7 BRAND PRESETS                                                     */
/*                                                                     */
/* warm    — terra cotta, serif, rounded  (welcoming, traditional)      */
/* calm    — teal, humanist sans, soft    (peaceful, approachable)      */
/* bold    — deep red, modern sans, sharp (energetic, contemporary)     */
/* classic — navy blue, serif, soft       (mainline, established)       */
/* modern  — slate/charcoal, sans, sharp  (minimal, urban)             */
/* forest  — deep green, humanist, soft   (organic, nature-forward)    */
/* royal   — deep purple, serif, rounded  (liturgical, high-church)    */
/* ------------------------------------------------------------------ */

export const presets: Record<BrandPresetName, ResolvedTheme> = {
  warm: {
    accent: '#b85c38',
    accentStrong: '#8e4021',
    bodyFont: 'classic-serif',
    headingFont: 'serif-display',
    heroTone: 'warm',
    ink: '#1d120c',
    radius: 'rounded',
    surface: '#f4ede3',
  },
  calm: {
    accent: '#386c7a',
    accentStrong: darken('#386c7a'),
    bodyFont: 'humanist-sans',
    headingFont: 'humanist-sans',
    heroTone: 'calm',
    ink: '#11242b',
    radius: 'soft',
    surface: '#e9f4f3',
  },
  bold: {
    accent: '#9d3412',
    accentStrong: darken('#9d3412'),
    bodyFont: 'neutral-sans',
    headingFont: 'modern-sans',
    heroTone: 'bold',
    ink: '#171210',
    radius: 'sharp',
    surface: '#f6ede6',
  },
  classic: {
    accent: '#2b4c7e',
    accentStrong: darken('#2b4c7e'),
    bodyFont: 'classic-serif',
    headingFont: 'serif-display',
    heroTone: 'classic',
    ink: '#1a1f2e',
    radius: 'soft',
    surface: '#eef2f7',
  },
  modern: {
    accent: '#3d3d3d',
    accentStrong: darken('#3d3d3d'),
    bodyFont: 'neutral-sans',
    headingFont: 'modern-sans',
    heroTone: 'modern',
    ink: '#1a1a1a',
    radius: 'sharp',
    surface: '#f5f5f5',
  },
  forest: {
    accent: '#2d6a4f',
    accentStrong: darken('#2d6a4f'),
    bodyFont: 'humanist-sans',
    headingFont: 'humanist-sans',
    heroTone: 'forest',
    ink: '#1b2e25',
    radius: 'soft',
    surface: '#ecf5f0',
  },
  royal: {
    accent: '#5b3a8c',
    accentStrong: darken('#5b3a8c'),
    bodyFont: 'classic-serif',
    headingFont: 'serif-display',
    heroTone: 'royal',
    ink: '#1e1528',
    radius: 'rounded',
    surface: '#f3eef8',
  },
}

/** Ordered list of preset names for iteration in admin UIs */
export const presetNames: BrandPresetName[] = [
  'warm',
  'calm',
  'bold',
  'classic',
  'modern',
  'forest',
  'royal',
]

/* ------------------------------------------------------------------ */
/* Resolve a church theme against a preset                             */
/* ------------------------------------------------------------------ */

export function resolveTheme(input?: ChurchThemeInput | null): ResolvedTheme {
  const presetName = (input?.preset ?? 'warm') as BrandPresetName
  const base = presets[presetName] ?? presets.warm

  const accent = input?.accent || base.accent
  return {
    accent,
    accentStrong: darken(accent),
    bodyFont: input?.bodyFont || base.bodyFont,
    headingFont: input?.headingFont || base.headingFont,
    heroTone: input?.heroTone || base.heroTone,
    ink: input?.ink || base.ink,
    radius: input?.radius || base.radius,
    surface: input?.surface || base.surface,
  }
}

/* ------------------------------------------------------------------ */
/* Convert resolved theme to CSS custom-property declarations          */
/* ------------------------------------------------------------------ */

export function themeToCSS(theme: ResolvedTheme): CSSProperties {
  const bodyFontFamily = fontFamilies[theme.bodyFont] ?? fontFamilies['classic-serif']
  const headingFontFamily = fontFamilies[theme.headingFont] ?? fontFamilies['serif-display']
  const radiusValue = radiusValues[theme.radius] ?? radiusValues.rounded

  return {
    // Church-scoped variables (consumed by heading/body font-family in base layer)
    ['--church-accent' as string]: theme.accent,
    ['--church-body-font' as string]: bodyFontFamily,
    ['--church-heading-font' as string]: headingFontFamily,
    ['--church-ink' as string]: theme.ink,
    ['--church-radius' as string]: radiusValue,
    ['--church-surface' as string]: theme.surface,
    // Override shadcn semantic variables for church scope
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
