import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/card'

interface Stat {
  label: string
  value: string
}

interface StatPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  stats: Stat[]
}

/**
 * A glass card showing a vertical stack of key metrics.
 * Used in hero sections for at-a-glance value propositions.
 */
export function StatPanel({ className, stats, ...props }: StatPanelProps) {
  return (
    <Card className={cn('grid gap-4 p-6', className)} {...props}>
      {stats.map((stat) => (
        <div className="grid gap-1" key={stat.label}>
          <strong className="text-accent-strong text-sm font-semibold uppercase tracking-wider">
            {stat.value}
          </strong>
          <span className="text-sm text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </Card>
  )
}
