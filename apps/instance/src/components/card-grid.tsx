import { cn } from '@/lib/cn'

interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Minimum card width for auto-fit layout */
  minWidth?: string
}

export function CardGrid({ children, className, minWidth = '240px', ...props }: CardGridProps) {
  return (
    <div
      className={cn('grid gap-4', className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}, 1fr))`,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
