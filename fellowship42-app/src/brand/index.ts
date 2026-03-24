/**
 * Fellowship42 — Brand system public API
 *
 * Re-exports everything the app and (future) website need from the brand layer.
 * Import from `@/brand` rather than reaching into individual modules.
 */

export {
  darken,
  fontFamilies,
  presetNames,
  presets,
  radiusValues,
  resolveTheme,
  themeToCSS,
} from './presets'

export type {
  BrandPresetName,
  ChurchThemeInput,
  ResolvedTheme,
} from './presets'
