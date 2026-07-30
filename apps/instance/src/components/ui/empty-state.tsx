import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'

export interface EmptyStateProps extends React.ComponentProps<'div'> {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  /** Primary action. Kept as a slot so the caller owns the button variant. */
  action?: React.ReactNode
  /** `inline` for empty table bodies, `panel` for a standalone region. */
  variant?: 'panel' | 'inline'
}

/**
 * One treatment for every "nothing here yet" case: a reason and, where the
 * reader can act, a way forward. Previously each route rendered a dashed card
 * with a sentence of muted text and no next step.
 */
function EmptyState({
  action,
  className,
  description,
  icon: Icon,
  title,
  variant = 'panel',
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        variant === 'panel'
          ? 'rounded-lg border border-dashed border-border bg-card/50 py-12'
          : 'py-12',
        className,
      )}
      {...props}
    >
      {Icon ? (
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[0.8125rem] text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
