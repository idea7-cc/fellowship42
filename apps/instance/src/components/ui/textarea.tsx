import * as React from 'react'

import { cn } from '@/lib/cn'
import { controlClass } from './control'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      className={cn(controlClass, 'min-h-20 resize-y px-3 py-2 leading-relaxed', className)}
      ref={ref}
      rows={rows}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export { Textarea }
