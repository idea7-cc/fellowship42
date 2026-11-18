import { Lock, RotateCw } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

/**
 * A failed load, said plainly. Render it before any empty state, so a failure
 * never reads as "nothing here". A refusal (403) is shown as denied access:
 * trying again would not change the answer. Anything else offers Try again.
 */
export function RequestError({
  error,
  onRetry,
  className,
}: {
  error: Error
  onRetry: () => void
  className?: string
}) {
  if (error instanceof ApiError && error.status === 403) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-border bg-surface-sunken p-2.5 text-sm text-muted-foreground',
          className,
        )}
        role="status"
      >
        <Lock aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          Your role does not include access to this. Ask a church owner if you
          need it.
        </span>
      </div>
    )
  }
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md bg-danger-soft p-2.5 text-sm text-danger-soft-foreground',
        className,
      )}
      role="alert"
    >
      <span className="min-w-0 flex-1">{error.message}</span>
      <Button onClick={onRetry} size="xs" variant="secondary">
        <RotateCw aria-hidden />
        Try again
      </Button>
    </div>
  )
}
