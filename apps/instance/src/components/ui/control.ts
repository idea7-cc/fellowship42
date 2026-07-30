/**
 * The shared visual contract for every form control.
 *
 * Input, Select, Textarea, and any hand-rolled field in a route all compose
 * from this so a form never mixes two different input treatments. Six routes
 * previously each carried their own copy of this string; they now import it.
 */
export const controlClass = [
  'flex w-full rounded-md border border-input bg-card text-sm text-foreground',
  'shadow-xs transition-colors duration-150 ease-brand',
  'placeholder:text-muted-foreground/70',
  'hover:border-border-strong',
  'focus-visible:border-ring',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
  'aria-invalid:border-destructive aria-invalid:hover:border-destructive',
].join(' ')

/** Height and padding for single-line controls. Multi-line uses `controlClass` alone. */
export const controlSizeClass = {
  sm: 'h-8 px-2.5 py-1',
  default: 'h-9 px-3 py-1.5',
  lg: 'h-10 px-3.5 py-2',
} as const

export type ControlSize = keyof typeof controlSizeClass
