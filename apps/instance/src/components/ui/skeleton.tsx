import { cn } from '@/lib/cn'

/**
 * Loading placeholders that occupy the shape of the content they replace.
 * "Loading..." in the middle of an empty card tells the reader nothing about
 * what is coming and makes the page jump when it arrives.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

/** Placeholder rows sized to the table they stand in for. */
function SkeletonTable({
  columns = 4,
  rows = 6,
  className,
}: {
  columns?: number
  rows?: number
  className?: string
}) {
  return (
    <div
      className={cn('divide-y divide-border', className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div className="flex items-center gap-3 px-4 py-3" key={rowIndex}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton
              className={cn('h-4', columnIndex === 0 ? 'w-[28%]' : 'flex-1')}
              key={columnIndex}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Placeholder cards for grid layouts. */
function SkeletonCards({
  count = 3,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          className="rounded-lg border border-border bg-card p-4"
          key={index}
        >
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-2.5 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-4/5" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonCards, SkeletonTable }
