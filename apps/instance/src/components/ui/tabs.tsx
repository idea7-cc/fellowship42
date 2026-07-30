import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * A segmented control for switching between views of the same region
 * (People / Households, Draft / Published). Built on native buttons with
 * roving focus so it behaves like a tablist rather than a row of buttons
 * that happen to look selected.
 */

export interface TabsProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  /** Accessible name for the tablist. */
  label: string
  className?: string
  children: React.ReactNode
}

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function Tabs<T extends string>({
  children,
  className,
  label,
  onValueChange,
  value,
}: TabsProps<T>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const context = React.useMemo<TabsContextValue>(
    () => ({ value, onValueChange: onValueChange as (next: string) => void }),
    [value, onValueChange],
  )

  // Left/Right arrows move between tabs, which is what a tablist promises.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [],
    )
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (current === -1) return
    event.preventDefault()
    const offset = event.key === 'ArrowRight' ? 1 : -1
    tabs[(current + offset + tabs.length) % tabs.length]?.focus()
  }

  return (
    <TabsContext.Provider value={context}>
      <div
        aria-label={label}
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5',
          className,
        )}
        onKeyDown={handleKeyDown}
        ref={listRef}
        role="tablist"
      >
        {children}
      </div>
    </TabsContext.Provider>
  )
}

export interface TabProps extends Omit<React.ComponentProps<'button'>, 'value'> {
  value: string
  count?: number
}

function Tab({ children, className, count, value, ...props }: TabProps) {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error('Tab must be used inside Tabs')
  const selected = context.value === value

  return (
    <button
      aria-selected={selected}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[0.8125rem] font-medium',
        'transition-colors duration-150 ease-brand',
        selected
          ? 'bg-card text-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      onClick={() => context.onValueChange(value)}
      role="tab"
      tabIndex={selected ? 0 : -1}
      type="button"
      {...props}
    >
      {children}
      {typeof count === 'number' ? (
        <span
          className={cn(
            'rounded-full px-1.5 text-[0.6875rem] tabular-nums',
            selected ? 'bg-muted text-muted-foreground' : 'bg-transparent',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

export { Tab, Tabs }
