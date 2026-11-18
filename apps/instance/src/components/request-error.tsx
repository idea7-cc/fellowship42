import { RotateCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

/** A failed load, said plainly, with a way to try it again. */
export function RequestError({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md bg-danger-soft p-2.5 text-sm text-danger-soft-foreground',
        className,
      )}
      role="alert"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <Button onClick={onRetry} size="xs" variant="secondary">
        <RotateCw aria-hidden />
        Try again
      </Button>
    </div>
  )
}
