import { cn } from '@/lib/cn'

interface SectionProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  'title'
> {
  /** Section title */
  title?: React.ReactNode
  /** Section description */
  description?: React.ReactNode
  /** Right-aligned controls for this section only. */
  actions?: React.ReactNode
}

export function Section({
  actions,
  children,
  className,
  description,
  title,
  ...props
}: SectionProps) {
  return (
    <section className={cn('mt-8 first:mt-0', className)} {...props}>
      {(title || description || actions) && (
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h2>{title}</h2>}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      )}
      {children}
    </section>
  )
}
