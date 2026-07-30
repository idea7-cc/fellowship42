import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/cn'
import { controlClass, controlSizeClass, type ControlSize } from './control'

export interface SelectProps extends Omit<React.ComponentProps<'select'>, 'size'> {
  selectSize?: ControlSize
  /** Classes for the wrapper, e.g. width constraints. */
  containerClassName?: string
}

/**
 * A styled native <select>. Native keeps keyboard behaviour, mobile pickers,
 * and form submission for free — worth more here than a custom listbox.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, selectSize = 'default', ...props }, ref) => (
    <div className={cn('relative', containerClassName)}>
      <select
        className={cn(
          controlClass,
          controlSizeClass[selectSize],
          'cursor-pointer appearance-none pr-8',
          className,
        )}
        ref={ref}
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
)
Select.displayName = 'Select'

export { Select }
