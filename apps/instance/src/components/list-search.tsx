import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export interface StatusFilter {
  value: string
  onChange: (value: string) => void
  /** Defaults to the publishing statuses. */
  label?: string
  options?: Array<{ value: string; label: string }>
}

const publishStatuses = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

/**
 * The search row above a publishing list. The search is applied on submit and
 * the status filter on change; both go to the server through the list's
 * `usePagedQuery`, which starts again at the first page.
 */
export function ListSearch({
  label,
  onSearch,
  status,
  children,
}: {
  label: string
  onSearch: (query: string) => void
  /** Staff lists filter by status; reader lists show published only. */
  status?: StatusFilter
  children?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  return (
    <form
      className="mb-6 flex flex-wrap gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(draft.trim())
      }}
      role="search"
    >
      <SearchInput
        aria-label={label}
        className="w-full sm:max-w-sm"
        onChange={(event) => setDraft(event.target.value)}
        placeholder={label}
        value={draft}
      />
      {status ? (
        <Select
          aria-label={status.label ?? 'Publishing status'}
          containerClassName="sm:w-40"
          onChange={(event) => status.onChange(event.target.value)}
          value={status.value}
        >
          <option value="">All statuses</option>
          {(status.options ?? publishStatuses).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : null}
      <Button size="sm" type="submit" variant="secondary">
        Search
      </Button>
      {children}
    </form>
  )
}
