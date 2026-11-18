import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { ChevronDown, X } from 'lucide-react'

import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
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
  failed?: { cursor: string | null; error: Error }
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
  const input = useRef<HTMLInputElement>(null)

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
            error:
              caught instanceof ApiError
                ? caught
                : new Error(`${label} options could not be loaded.`),
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

  // Results of an earlier search are never offered once the text has moved
  // on: Down then Enter must not pick from a list the user typed over.
  const loaded = settled && results?.key === key ? results : null
  const options = (loaded?.items ?? [])
    .filter((item) => !isExcluded?.(item))
    .map((item) => ({ ...toChoice(item), detail: describe?.(item) }))
  const hiddenCount = (loaded?.items.length ?? 0) - options.length
  const statusText =
    !loaded || loaded.loading
      ? 'Searching…'
      : loaded.failed
        ? null
        : options.length
          ? `${options.length} ${options.length === 1 ? 'result' : 'results'}${loaded.nextCursor ? ', more available' : ''}.`
          : hiddenCount
            ? 'Everyone found so far is already listed here.'
            : 'No matches.'

  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, listId])

  // Closing discards the search: the next open starts unfiltered and fresh.
  // The committed choice lives in `value` and is kept.
  function reset() {
    guard.invalidate()
    setOpen(false)
    setTyping(false)
    setQuery('')
    setResults(null)
    setActive(-1)
  }

  function close() {
    reset()
    setText(value?.label ?? '')
  }

  function choose(choice: RecordChoice) {
    onChange({ id: choice.id, label: choice.label })
    reset()
    setText(choice.label)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      else setActive((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open) {
      // While the list is open Enter belongs to it, never to the form.
      event.preventDefault()
      if (options[active]) choose(options[active])
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
            // Text that no longer names the choice means nothing is chosen;
            // the form must not quietly submit the earlier record.
            if (value && event.target.value !== value.label) onChange(null)
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? `Search ${label.toLowerCase()}`}
          ref={input}
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
            <div className="grid gap-1.5 border-t border-border px-2.5 py-1.5 text-xs text-muted-foreground empty:hidden">
              <p aria-live="polite" className="empty:hidden" role="status">
                {statusText}
              </p>
              {loaded?.failed ? (
                <RequestError
                  error={loaded.failed.error}
                  onRetry={() => void load(loaded.failed!.cursor)}
                />
              ) : loaded?.nextCursor && !loaded.loading ? (
                <button
                  className="justify-self-start font-medium text-brand-text hover:underline"
                  onClick={() => {
                    // This button disappears while loading; keep focus in
                    // the field so the keyboard user is not dropped.
                    input.current?.focus()
                    void load(loaded.nextCursor)
                  }}
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

/**
 * The media an editor opened with, as a picker choice. It starts labelled with
 * the id and takes the file's description once its metadata loads, so a
 * reopened sermon or lesson names its attachment even when that file is not
 * in the picker's loaded results.
 */
export function useSavedMediaChoice(
  churchId: string | null,
  mediaId: string | undefined,
) {
  const [choice, setChoice] = useState<RecordChoice | null>(
    mediaId ? { id: mediaId, label: mediaId } : null,
  )
  const saved = useApiQuery<{ media: MediaRecord }>(
    churchId && mediaId
      ? `/api/media/${encodeURIComponent(churchId)}/${encodeURIComponent(mediaId)}`
      : null,
  )
  const description = saved.data?.media?.altText
  const shown =
    choice && choice.id === mediaId && choice.label === mediaId && description
      ? { id: choice.id, label: description }
      : choice
  return [shown, setChoice] as const
}
