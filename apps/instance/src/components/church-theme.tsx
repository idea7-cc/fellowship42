import type { CSSProperties } from 'react'

import { resolveTheme, themeToCSS, type ChurchThemeInput } from '@/lib/theme'
import { cn } from '@/lib/cn'

interface ChurchThemeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Raw theme input from the church record returned by the edge API */
  theme?: ChurchThemeInput | null
  /**
   * `brand`   — publish the congregation's identity under --church-* only.
   *             Product chrome keeps the neutral Fellowship42 palette, so a
   *             table stays legible whichever preset the church picked.
   *             This is the default and the right choice for operator screens.
   *
   * `surface` — render this whole region in the church's brand: surface, ink,
   *             accent, radius, and fonts. For member-facing and published
   *             content, and for previewing what visitors will see.
   */
  scope?: 'brand' | 'surface'
}

/**
 * Establishes a church's brand context.
 *
 * Wrapping operator content is safe and useful: descendants can reach for
 * `bg-church-accent` or `text-church-ink` to show whose data they are looking
 * at, while everything else stays in the product palette. Only `scope="surface"`
 * repaints the semantic tokens.
 */
export function ChurchTheme({
  children,
  className,
  scope = 'brand',
  theme,
  ...props
}: ChurchThemeProps) {
  const resolved = resolveTheme(theme)
  const cssVars = themeToCSS(resolved, { scope })

  return (
    <div
      className={cn(scope === 'surface' && 'church-surface', className)}
      style={cssVars as CSSProperties}
      {...props}
    >
      {children}
    </div>
  )
}
