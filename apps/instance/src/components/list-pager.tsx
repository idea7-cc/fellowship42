import type { PagerState } from '@/lib/paged-query'
import { Button } from '@/components/ui/button'

/** Previous/next control for a list built with `usePagedQuery`. */
export function ListPager({
  label,
  page,
  pageNumber,
  onPrevious,
  onNext,
  disabled = false,
}: PagerState & { label: string; disabled?: boolean }) {
  if (pageNumber === 1 && !page?.nextCursor) return null
  return (
    <nav
      aria-label={label}
      className="mt-3 flex items-center justify-between gap-3"
    >
      <span className="text-xs text-muted-foreground">
        Page {pageNumber}
        {page ? ` · up to ${page.limit} per page` : ''}
      </span>
      <div className="flex gap-2">
        <Button
          disabled={disabled || pageNumber === 1}
          onClick={onPrevious}
          size="sm"
          variant="secondary"
        >
          Previous
        </Button>
        <Button
          disabled={disabled || !page?.nextCursor}
          onClick={() => page?.nextCursor && onNext(page.nextCursor)}
          size="sm"
          variant="secondary"
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
