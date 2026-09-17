import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'

export interface MetricProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Sentence case, no trailing colon. */
  label: string
  value: React.ReactNode
  /** Optional context under the value — a period, a qualifier, a source. */
  hint?: React.ReactNode
  icon?: LucideIcon
  delta?: {
    /** Signed value; the sign drives the arrow. */
    value: number
    /** The period being compared against, e.g. "vs last month". */
    period: string
    /**
     * Whether an increase is good. Attendance up is good; giving arrears up
     * is not — so direction alone cannot pick the color.
     */
    upIsGood?: boolean
    /** Render as a percentage rather than a count. */
    unit?: 'percent' | 'count'
  }
}

/**
 * A stat tile: one current value, optionally with movement.
 *
 * The value uses the font's proportional figures on purpose. `tabular-nums`
 * gives every digit the width of a zero, which reads loose at display sizes;
 * it belongs in columns that must align vertically, not on a standalone
 * number. Tables opt into it in the base layer.
 */
export function Metric({
  className,
  delta,
  hint,
  icon: Icon,
  label,
  value,
  ...props
}: MetricProps) {
  const rising = delta ? delta.value > 0 : false
  const good = delta ? rising === (delta.upIsGood ?? true) : true
  const DeltaArrow = rising ? ArrowUp : ArrowDown

  return (
    <div
      className={cn('rounded-lg border border-border bg-card p-4', className)}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        {Icon ? (
          <Icon aria-hidden className="size-3.5 text-muted-foreground" />
        ) : null}
        <span className="text-[0.8125rem] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl leading-none font-semibold tracking-tight">
          {value}
        </span>
        {delta && delta.value !== 0 ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              good ? 'text-success' : 'text-danger',
            )}
          >
            <DeltaArrow aria-hidden className="size-3" />
            {formatDelta(delta.value, delta.unit)}
            <span className="sr-only">
              {rising ? 'increase' : 'decrease'} {delta.period}
            </span>
          </span>
        ) : null}
      </div>
      {(delta || hint) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {hint ?? delta?.period}
        </p>
      )}
    </div>
  )
}

/** A row of stat tiles. Keep it to four or fewer — past that it is a table. */
export function MetricRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}
      {...props}
    />
  )
}

function formatDelta(
  value: number,
  unit: 'percent' | 'count' = 'count',
): string {
  const magnitude = Math.abs(value)
  return unit === 'percent' ? `${magnitude}%` : formatCompact(magnitude)
}

/** 1,284 / 12.9K / 4.2M — readable at a glance without losing the order. */
export function formatCompact(value: number): string {
  if (Math.abs(value) < 10_000) return value.toLocaleString('en-US')
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}
