import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

/**
 * A card is a value step above the page, not a pane of frosted glass. The
 * previous translucent + blurred + heavily shadowed treatment made every
 * surface muddy and cost a compositor layer per card in long lists.
 *
 * `interactive` is for cards that are themselves links or buttons; it adds
 * hover feedback and should not be used on static content.
 */
const cardVariants = cva(
  'rounded-lg border bg-card text-card-foreground transition-colors duration-150 ease-brand',
  {
    defaultVariants: {
      elevation: 'flat',
      padding: 'default',
    },
    variants: {
      elevation: {
        flat: 'border-border shadow-none',
        raised: 'border-border shadow-sm',
        floating: 'border-border shadow-md',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        default: 'p-4',
        lg: 'p-6',
      },
      interactive: {
        true: 'cursor-pointer hover:border-border-strong hover:bg-accent/60',
      },
    },
  },
)

export interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, interactive, padding, ...props }, ref) => (
    <div
      className={cn(
        cardVariants({ className, elevation, interactive, padding }),
      )}
      ref={ref}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div className={cn('flex flex-col gap-1', className)} ref={ref} {...props} />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    className={cn(
      'text-[0.9375rem] leading-snug font-semibold tracking-tight',
      className,
    )}
    ref={ref}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    className={cn(
      'text-[0.8125rem] leading-relaxed text-muted-foreground',
      className,
    )}
    ref={ref}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div className={cn('grid gap-3', className)} ref={ref} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    className={cn('flex items-center gap-2', className)}
    ref={ref}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

/** Full-bleed divider inside a padded card. */
const CardDivider = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div className={cn('-mx-4 h-px bg-border', className)} ref={ref} {...props} />
))
CardDivider.displayName = 'CardDivider'

export {
  Card,
  CardContent,
  CardDescription,
  CardDivider,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
}
