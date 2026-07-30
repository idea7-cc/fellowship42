import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * Form layout primitives. Routes previously repeated
 * `<label className="grid gap-1 text-sm font-semibold">` around every control,
 * which made the label bolder than the value it described and left no room
 * for hint or error text.
 */

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<'label'>>(
  ({ className, ...props }, ref) => (
    <label
      className={cn(
        'text-[0.8125rem] leading-none font-medium text-foreground',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Label.displayName = 'Label'

export interface FieldProps extends Omit<React.ComponentProps<'label'>, 'title'> {
  label: React.ReactNode
  /** Guidance shown under the control. */
  hint?: React.ReactNode
  /** Validation message. Replaces the hint and marks the field invalid. */
  error?: React.ReactNode
  /** Renders a required marker next to the label. */
  required?: boolean
}

/**
 * A labelled control. Wraps its child in a <label>, so the control does not
 * need an explicit id to be associated with its text.
 */
const Field = React.forwardRef<HTMLLabelElement, FieldProps>(
  ({ children, className, error, hint, required, label, ...props }, ref) => (
    <label className={cn('grid gap-1.5', className)} ref={ref} {...props}>
      <span className="flex items-center gap-1 text-[0.8125rem] leading-none font-medium text-foreground">
        {label}
        {required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  ),
)
Field.displayName = 'Field'

/** A responsive two-column field grid. */
function FieldGrid({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)} {...props} />
}

/** A checkbox with its label, aligned on the control rather than the text. */
export interface CheckboxFieldProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  label: React.ReactNode
  hint?: React.ReactNode
}

const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ className, hint, label, ...props }, ref) => (
    <label className={cn('flex items-start gap-2.5 py-1.5', className)}>
      <input
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-xs border-input accent-[var(--primary)]"
        ref={ref}
        type="checkbox"
        {...props}
      />
      <span className="grid gap-0.5">
        <span className="text-[0.8125rem] leading-tight font-medium">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  ),
)
CheckboxField.displayName = 'CheckboxField'

/** Actions row at the foot of a form. */
function FormActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 border-t border-border pt-4', className)}
      {...props}
    />
  )
}

export { CheckboxField, Field, FieldGrid, FormActions, Label }
