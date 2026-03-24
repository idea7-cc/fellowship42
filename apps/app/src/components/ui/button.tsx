import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans text-sm font-bold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-12 px-5 text-[0.95rem]',
        icon: 'h-10 w-10',
        lg: 'h-14 px-7 text-base',
        sm: 'h-9 px-3.5 text-sm',
      },
      variant: {
        default:
          'bg-gradient-to-br from-primary to-accent-strong text-primary-foreground shadow-sm hover:-translate-y-px hover:shadow-md rounded-full',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 rounded-lg',
        ghost: 'hover:bg-accent hover:text-accent-foreground rounded-lg',
        link: 'text-accent-strong font-bold font-sans underline-offset-4 hover:underline hover:-translate-y-px',
        outline:
          'border border-border bg-white/65 backdrop-blur-sm shadow-sm hover:-translate-y-px hover:shadow-md rounded-full',
        secondary:
          'border border-border bg-white/65 backdrop-blur-sm shadow-sm hover:-translate-y-px hover:shadow-md rounded-full',
      },
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ className, size, variant }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
