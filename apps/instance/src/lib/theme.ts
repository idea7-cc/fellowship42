import type { CSSProperties } from 'react'

import {
  themeToCSS as toCSSRecord,
  type ResolvedTheme,
  type ThemeToCSSOptions,
} from '@fellowship42/brand'

// The brand package is the single source of truth. This module only adapts it
// to React's CSSProperties, which does not model custom properties.
export {
  contrastRatio,
  getAccentContrast,
  getFontFamily,
  getRadiusValue,
  presetNames,
  presets,
  resolveTheme,
} from '@fellowship42/brand'
export type {
  BrandPresetName,
  ChurchThemeInput,
  ResolvedTheme,
  ThemeToCSSOptions,
} from '@fellowship42/brand'

export function themeToCSS(
  theme: ResolvedTheme,
  options?: ThemeToCSSOptions,
): CSSProperties {
  return toCSSRecord(theme, options) as CSSProperties
}
