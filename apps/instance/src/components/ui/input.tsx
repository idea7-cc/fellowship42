import * as React from 'react'
import { Search } from 'lucide-react'

import { cn } from '@/lib/cn'
import { controlClass, controlSizeClass, type ControlSize } from './control'

export interface InputProps extends Omit<React.ComponentProps<'input'>, 'size'> {
  inputSize?: ControlSize
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputSize = 'default', type, ...props }, ref) => (
    <input
      className={cn(
        controlClass,
        controlSizeClass[inputSize],
        'file:mr-3 file:border-0 file:bg-transparent file:p-0 file:text-sm file:font-medium file:text-brand-text',
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

/** An input with a leading search affordance. Used by every list toolbar. */
const SearchInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputSize = 'default', ...props }, ref) => (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input className="pl-8.5" inputSize={inputSize} ref={ref} type="search" {...props} />
    </div>
  ),
)
SearchInput.displayName = 'SearchInput'

export { Input, SearchInput }
