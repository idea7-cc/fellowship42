import type { CSSProperties } from 'react'

import { resolveTheme, themeToCSS, type ChurchThemeInput } from '@/brand'
import { cn } from '@/lib/cn'

interface ChurchThemeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Raw theme input from the church's Payload record */
  theme?: ChurchThemeInput | null
}

/**
 * Wraps content in a church-scoped container that sets CSS custom properties
 * for the church's brand. All descendant components automatically pick up
 * the overridden tokens via the shadcn semantic variable contract.
 */
export function ChurchTheme({ children, className, theme, ...props }: ChurchThemeProps) {
  const resolved = resolveTheme(theme)
  const cssVars = themeToCSS(resolved)

  return (
    <div
      className={cn(className)}
      style={cssVars as CSSProperties}
      {...props}
    >
      {children}
    </div>
  )
}
