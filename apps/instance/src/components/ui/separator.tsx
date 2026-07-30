import * as React from 'react'

import { cn } from '@/lib/cn'

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  decorative?: boolean
  orientation?: 'horizontal' | 'vertical'
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, decorative = true, orientation = 'horizontal', ...props }, ref) => (
    <div
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      )}
      data-orientation={orientation}
      ref={ref}
      role={decorative ? 'none' : 'separator'}
      {...props}
    />
  ),
)
Separator.displayName = 'Separator'

export { Separator }
