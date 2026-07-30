import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

/**
 * Badges carry state, so they are colored by meaning rather than decoration.
 * Every variant pairs a soft background with a foreground that clears AA
 * against it in both modes — see the --f42-*-soft token pairs.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full text-xs font-medium leading-none [&_svg]:size-3 [&_svg]:shrink-0',
  {
    defaultVariants: {
      size: 'default',
      variant: 'neutral',
    },
    variants: {
      size: {
        default: 'h-[1.375rem] px-2',
        sm: 'h-5 px-1.5 text-[0.6875rem]',
      },
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        muted: 'bg-muted text-muted-foreground',
        brand: 'bg-brand-soft text-brand-soft-foreground',
        pill: 'bg-brand-soft text-brand-soft-foreground',
        default: 'bg-brand-soft text-brand-soft-foreground',
        success: 'bg-success-soft text-success-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        danger: 'bg-danger-soft text-danger-soft-foreground',
        destructive: 'bg-danger-soft text-danger-soft-foreground',
        info: 'bg-info-soft text-info-soft-foreground',
        outline: 'border border-border bg-transparent text-muted-foreground',
      },
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, size, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ size, variant }), className)} {...props} />
}

type BadgeVariant = NonNullable<BadgeProps['variant']>

/**
 * Domain status -> color. Centralised so "published" is the same green on the
 * sermon list, the course list, and the event list. Add new statuses here
 * rather than choosing a variant at the call site.
 */
const statusVariants: Record<string, BadgeVariant> = {
  // Publication lifecycle — churches, groups, courses, events, sermons,
  // ministries. See the `status` CHECK constraints in migrations/.
  published: 'success',
  draft: 'neutral',
  archived: 'neutral',
  // Enrollment policy — groups
  open: 'success',
  request: 'info',
  closed: 'neutral',
  full: 'warning',
  // Membership status — people
  member: 'success',
  volunteer: 'brand',
  'regular-attender': 'info',
  guest: 'neutral',
  inactive: 'neutral',
  // Contribution status — the four values the schema permits
  succeeded: 'success',
  pending: 'warning',
  refunded: 'warning',
  failed: 'danger',
  // User and membership account status
  active: 'success',
  invited: 'info',
  suspended: 'danger',
  // Generic outcomes used by management and lifecycle views
  complete: 'success',
  completed: 'success',
  scheduled: 'info',
  cancelled: 'danger',
  canceled: 'danger',
  error: 'danger',
}

/** Humanise a slug-cased status for display: `regular-attender` -> `Regular attender`. */
function humanizeStatus(status: string): string {
  const spaced = status.replace(/[-_]/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export interface StatusBadgeProps extends Omit<BadgeProps, 'children' | 'variant'> {
  status: string
  /** Override the derived color for a status this map does not know. */
  variant?: BadgeVariant
}

function StatusBadge({ status, variant, ...props }: StatusBadgeProps) {
  const key = status.trim().toLowerCase()
  return (
    <Badge variant={variant ?? statusVariants[key] ?? 'neutral'} {...props}>
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current opacity-70"
      />
      {humanizeStatus(status)}
    </Badge>
  )
}

export { Badge, badgeVariants, humanizeStatus, StatusBadge, statusVariants }
