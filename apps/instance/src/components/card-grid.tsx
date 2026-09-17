import { cn } from '@/lib/cn'

interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Minimum card width for auto-fit layout */
  minWidth?: string
}

export function CardGrid({
  children,
  className,
  minWidth = '280px',
  ...props
}: CardGridProps) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))`,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
