import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

/**
 * Sizes step in 4px increments around a 36px default — the density an operator
 * toolbar needs when it carries five controls. Hover changes color, never
 * position: nothing above a data table should move under the cursor.
 * Focus is handled once, globally, in globals.css.
 */
const buttonVariants = cva(
  [
    'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap',
    'font-medium transition-colors duration-150 ease-brand',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        xs: 'h-7 gap-1 rounded-sm px-2 text-xs [&_svg]:size-3.5',
        sm: 'h-8 rounded-sm px-2.5 text-[0.8125rem] [&_svg]:size-4',
        default: 'h-9 rounded-md px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-10 rounded-md px-4 text-sm [&_svg]:size-4',
        icon: 'h-9 w-9 rounded-md [&_svg]:size-4',
        'icon-sm': 'h-8 w-8 rounded-sm [&_svg]:size-4',
        'icon-xs': 'h-7 w-7 rounded-sm [&_svg]:size-3.5',
      },
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-brand-hover active:brightness-[0.95]',
        secondary:
          'border border-border bg-card text-foreground shadow-xs hover:border-border-strong hover:bg-accent active:bg-muted',
        outline:
          'border border-border bg-transparent text-foreground hover:border-border-strong hover:bg-accent active:bg-muted',
        subtle:
          'bg-brand-soft text-brand-soft-foreground hover:brightness-[0.97] active:brightness-[0.94]',
        ghost:
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-muted',
        link: 'h-auto rounded-xs px-0 text-brand-text underline-offset-4 hover:underline',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:brightness-[1.08] active:brightness-[0.95]',
        // Neutral until intent is shown. A red icon on every row of a
        // directory reads as twelve warnings rather than twelve delete
        // affordances; the color belongs on hover and focus, not at rest.
        'destructive-ghost':
          'text-muted-foreground hover:bg-danger-soft hover:text-danger-soft-foreground focus-visible:bg-danger-soft focus-visible:text-danger-soft-foreground',
      },
    },
  },
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, type, variant, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        // A bare <button> in a form defaults to submit. Toolbar actions that
        // forget `type` should not submit the form behind them.
        type={asChild ? undefined : (type ?? 'button')}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
