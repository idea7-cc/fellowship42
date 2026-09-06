import { cn } from '@/lib/cn'

interface HeroProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * default  — plain padding, no panel treatment
   * church   — a church-branded panel, tinted with the congregation's accent
   * landing  — a fuller church-branded panel for public and member-facing pages
   */
  variant?: 'default' | 'church' | 'landing'
}

/**
 * A hero belongs on church-facing pages, not above an operator table. Both
 * panel variants draw from the --church-* namespace, so they carry the
 * congregation's identity while the surrounding chrome stays neutral. Place
 * them inside a <ChurchTheme> for the tokens to resolve to that church.
 */
export function Hero({
  children,
  className,
  variant = 'default',
  ...props
}: HeroProps) {
  return (
    <section
      className={cn(
        variant === 'default' && 'py-2',
        variant !== 'default' && [
          'relative overflow-hidden rounded-[var(--church-radius)] border border-border',
          'bg-card p-6 sm:p-8',
          // A single wash of the church accent from the top-left, mixed
          // against the card so it stays subtle on any preset.
          'before:pointer-events-none before:absolute before:inset-0',
          'before:bg-[radial-gradient(80%_120%_at_0%_0%,var(--church-accent),transparent_70%)]',
          variant === 'church'
            ? 'before:opacity-[0.07]'
            : 'before:opacity-[0.12]',
        ],
        className,
      )}
      {...props}
    >
      {variant === 'default' ? (
        children
      ) : (
        <div className="relative">{children}</div>
      )}
    </section>
  )
}

export function HeroActions({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-5 flex flex-wrap items-center gap-2', className)}
      {...props}
    >
      {children}
    </div>
  )
}
