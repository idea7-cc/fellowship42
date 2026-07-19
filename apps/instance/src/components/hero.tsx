import type { CSSProperties } from 'react'

import { cn } from '@/lib/cn'

interface HeroProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * default  — plain padding, no card treatment
   * church   — glass card with gradient (church site hero)
   * landing  — church-scoped gradient card (landing page hero)
   */
  variant?: 'default' | 'church' | 'landing'
}

const landingHeroStyle: CSSProperties = {
  background:
    'linear-gradient(145deg, color-mix(in srgb, var(--card) 88%, white 12%), color-mix(in srgb, var(--primary) 12%, var(--card) 88%))',
  borderColor: 'color-mix(in srgb, var(--foreground) 12%, white 88%)',
}

export function Hero({ children, className, style, variant = 'default', ...props }: HeroProps) {
  return (
    <section
      className={cn(
        'py-8 pb-16',
        variant === 'church' &&
          'rounded-[calc(var(--radius)+0.5rem)] border border-border/60 bg-gradient-to-br from-white/65 to-amber-50/80 p-8 shadow-[var(--f42-shadow-lg)]',
        variant === 'landing' &&
          'rounded-[calc(var(--radius)+0.75rem)] border p-8 shadow-[var(--f42-shadow-lg)]',
        className,
      )}
      style={variant === 'landing' ? { ...landingHeroStyle, ...style } : style}
      {...props}
    >
      {children}
    </section>
  )
}

export function HeroActions({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mt-6 flex flex-wrap gap-3', className)} {...props}>
      {children}
    </div>
  )
}
