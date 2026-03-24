import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center font-mono text-xs font-medium uppercase tracking-widest transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'text-accent-strong',
        destructive: 'text-destructive',
        muted: 'text-muted-foreground',
        outline: 'border border-border px-2.5 py-0.5 rounded-full text-accent-strong',
        pill: 'bg-primary/10 text-accent-strong px-2.5 py-0.5 rounded-full',
      },
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
