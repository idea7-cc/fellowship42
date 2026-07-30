import { cn } from '@/lib/cn'

interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {}

/**
 * A small label that names the region a heading belongs to.
 *
 * It used to be a Badge, which gave a piece of orientation text the same
 * visual weight as a status chip. It is now quiet by construction: a badge
 * says "this record is published"; an eyebrow only says "you are in People".
 */
export function Eyebrow({ className, ...props }: EyebrowProps) {
  return (
    <span
      className={cn(
        'mb-1 block text-xs font-medium tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
