import {
  useCallback,
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
} from 'react'
import { ChevronDown, X } from 'lucide-react'

import { ApiError, apiRequest } from '@/lib/api'
import type { CursorPage, MediaRecord, Person } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { useRequestGuard } from '@/lib/request-guard'
import { controlClass, controlSizeClass } from '@/components/ui/control'
import { RequestError } from '@/components/request-error'

export interface RecordChoice {
  id: string
  label: string
}

const PAGE_SIZE = 20
const SEARCH_DELAY_MS = 200

interface Results<T> {
  key: string
  items: T[]
  nextCursor: string | null
  loading: boolean
  /** The cursor whose load failed (`null` for the first page). */
  failed?: { cursor: string | null; message: string }
}

/**
 * Choose one record from a cursor-paged list endpoint by typing part of its
 * name. Results come from the server (`query`), so every record is reachable;
 * **Show more results** follows the cursor. The chosen record stays visible in
 * the field even when it is not in the loaded results.
 *
 * The value is controlled and submitted through a hidden input named `name`.
 * The browser does not enforce `required` on it, so callers check the value
 * before saving.
 */
export function RecordCombobox<T>({
  label,
  name,
  path,
  collection,
  params,
  toChoice,
  describe,
  isExcluded,
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  className,
}: {
  label: string
  name: string
  /** A list endpoint that accepts `query`, `cursor` and `limit`. */
  path: string
  /** The response key holding the records, e.g. `people`. */
  collection: string
  /** Fixed filters sent with every search. */
  params?: Record<string, string>
  toChoice: (item: T) => RecordChoice
  /** A short second line for an option, e.g. an email address. */
  describe?: (item: T) => string | undefined
  /** Loaded records that cannot be chosen here, such as current members. */
  isExcluded?: (item: T) => boolean
  value: RecordChoice | null
  onChange: (choice: RecordChoice | null) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
}) {
  const inputId = useId()
  const listId = `${inputId}-options`
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value?.label ?? '')
  const [typing, setTyping] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [results, setResults] = useState<Results<T> | null>(null)
  const guard = useRequestGuard()

  const fixed = new URLSearchParams(params).toString()
  const key = `${path}?${fixed}#${query}`

  // The field shows the chosen record unless someone is typing a search.
  useEffect(() => {
    if (!typing) setText(value?.label ?? '')
  }, [value?.id, value?.label, typing])

  useEffect(() => {
    if (!typing) return
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, typing])

  const load = useCallback(
    async (cursor: string | null) => {
      const ticket = guard.start()
      const search = new URLSearchParams(fixed)
      search.set('limit', String(PAGE_SIZE))
      if (query) search.set('query', query)
      if (cursor) search.set('cursor', cursor)
      setResults((previous) =>
        cursor && previous?.key === key
          ? { ...previous, loading: true, failed: undefined }
          : { key, items: [], nextCursor: null, loading: true },
      )
      try {
        const body = await apiRequest<
          Record<string, unknown> & { page?: CursorPage }
        >(`${path}?${search}`, { signal: ticket.signal })
        if (!ticket.isCurrent()) return
        const items = (body[collection] as T[] | undefined) ?? []
        setResults((previous) => ({
          key,
          items:
            cursor && previous?.key === key
              ? [...previous.items, ...items]
              : items,
          nextCursor: body.page?.nextCursor ?? null,
          loading: false,
        }))
      } catch (caught) {
        if (!ticket.isCurrent()) return
        setResults((previous) => ({
          key,
          items: cursor && previous?.key === key ? previous.items : [],
          nextCursor: cursor,
          loading: false,
          failed: {
            cursor,
            message:
              caught instanceof ApiError
                ? caught.message
                : `${label} options could not be loaded.`,
          },
        }))
      }
    },
    [collection, fixed, guard, key, label, path, query],
  )

  // While someone is typing, wait for the search to settle before loading.
  const settled = !typing || query === text.trim()
  useEffect(() => {
    if (open && settled && results?.key !== key) void load(null)
  }, [open, settled, key, results?.key, load])

  const loaded = results?.key === key ? results : null
  const options = (loaded?.items ?? [])
    .filter((item) => !isExcluded?.(item))
    .map((item) => ({ ...toChoice(item), detail: describe?.(item) }))
  const hiddenCount = (loaded?.items.length ?? 0) - options.length
  const statusText =
    !loaded || loaded.loading
      ? 'Searching…'
      : loaded.failed || options.length
        ? null
        : hiddenCount
          ? 'Everyone found so far is already listed here.'
          : 'No matches.'

  function close() {
    setOpen(false)
    setTyping(false)
    setActive(-1)
    setText(value?.label ?? '')
  }

  function choose(choice: RecordChoice) {
    onChange({ id: choice.id, label: choice.label })
    setText(choice.label)
    setTyping(false)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      else setActive((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open && options[active]) {
      event.preventDefault()
      choose(options[active])
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    }
  }

  return (
    <div
      className={cn('grid gap-1.5', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          close()
      }}
    >
      <label
        className="flex items-center gap-1 text-[0.8125rem] leading-none font-medium text-foreground"
        htmlFor={inputId}
      >
        {label}
        {required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </label>
      <div className="relative">
        <input
          aria-activedescendant={
            open && options[active] ? `${listId}-${active}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-required={required || undefined}
          autoComplete="off"
          className={cn(controlClass, controlSizeClass.sm, 'pr-14')}
          disabled={disabled}
          id={inputId}
          onChange={(event) => {
            setText(event.target.value)
            setTyping(true)
            setOpen(true)
            setActive(-1)
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? `Search ${label.toLowerCase()}`}
          role="combobox"
          type="text"
          value={text}
        />
        <input name={name} type="hidden" value={value?.id ?? ''} />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {value && !disabled ? (
            <button
              aria-label={`Clear ${label.toLowerCase()}`}
              className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                onChange(null)
                setText('')
              }}
              type="button"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
          <button
            aria-label={`Show ${label.toLowerCase()} options`}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
            disabled={disabled}
            onClick={() => (open ? close() : setOpen(true))}
            onMouseDown={(event) => event.preventDefault()}
            tabIndex={-1}
            type="button"
          >
            <ChevronDown aria-hidden className="size-4" />
          </button>
        </div>
        {open ? (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md">
            <ul
              aria-label={label}
              className="max-h-64 overflow-auto py-1"
              id={listId}
              role="listbox"
            >
              {options.map((option, index) => (
                <li
                  aria-selected={option.id === value?.id}
                  className={cn(
                    'cursor-pointer px-2.5 py-1.5 text-sm',
                    index === active && 'bg-accent',
                    option.id === value?.id && 'font-medium',
                  )}
                  id={`${listId}-${index}`}
                  key={option.id}
                  onClick={() => choose(option)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  role="option"
                >
                  <span className="block truncate">{option.label}</span>
                  {option.detail ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <div
              aria-live="polite"
              className="grid gap-1.5 border-t border-border px-2.5 py-1.5 text-xs text-muted-foreground empty:hidden"
            >
              {statusText}
              {loaded?.failed ? (
                <RequestError
                  message={loaded.failed.message}
                  onRetry={() => void load(loaded.failed!.cursor)}
                />
              ) : loaded?.nextCursor && !loaded.loading ? (
                <button
                  className="justify-self-start font-medium text-brand-text hover:underline"
                  onClick={() => void load(loaded.nextCursor)}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                >
                  Show more results
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** A `RecordCombobox` over the church's people directory. */
export function PersonCombobox({
  churchId,
  ...props
}: Omit<
  Parameters<typeof RecordCombobox<Person>>[0],
  'path' | 'collection' | 'toChoice' | 'describe'
> & { churchId: string }) {
  return (
    <RecordCombobox<Person>
      {...props}
      collection="people"
      describe={(person) => person.email ?? person.phone}
      path={`/api/people/${encodeURIComponent(churchId)}`}
      placeholder={props.placeholder ?? 'Search by name, email, or phone'}
      toChoice={(person) => ({
        id: person.id,
        label: `${person.firstName} ${person.lastName}`,
      })}
    />
  )
}

/**
 * A `RecordCombobox` over the church's public media. Visibility and type are
 * filtered on the server, so every eligible file is reachable.
 */
export function PublicMediaCombobox({
  churchId,
  mediaType,
  ...props
}: Omit<
  Parameters<typeof RecordCombobox<MediaRecord>>[0],
  'path' | 'collection' | 'toChoice' | 'describe' | 'params'
> & { churchId: string; mediaType?: 'audio' }) {
  return (
    <RecordCombobox<MediaRecord>
      {...props}
      collection="media"
      describe={(media) => media.contentType}
      params={
        mediaType
          ? { visibility: 'public', mediaType }
          : { visibility: 'public' }
      }
      path={`/api/media/${encodeURIComponent(churchId)}`}
      placeholder={props.placeholder ?? 'Search by description'}
      toChoice={(media) => ({ id: media.id, label: media.altText || media.id })}
    />
  )
}
