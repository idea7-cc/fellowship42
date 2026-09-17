import { CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ChurchSettings } from '../../contracts/church-settings'
import { useApiQuery } from '@/lib/api'
import { useAuthState } from '@/lib/auth-provider'
import { useChurch } from '@/lib/church-context'

export function ChurchSetupProgress() {
  const { churchId } = useChurch()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const allowed =
    permissions.includes('*') || permissions.includes('church.write')
  const { data } = useApiQuery<ChurchSettings>(
    allowed ? `/api/church-settings/${encodeURIComponent(churchId)}` : null,
  )
  if (!data || data.published) return null
  const steps = [
    {
      label: 'Church details',
      done: data.readiness.profile,
      href: '/app/settings',
    },
    {
      label: 'Gatherings',
      done: data.readiness.services,
      href: '/app/settings',
    },
    {
      label: 'First content',
      done: data.readiness.content,
      href: '/app/groups',
    },
  ]
  return (
    <section
      aria-label="Finish church setup"
      className="mb-6 rounded-lg border border-border p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">Finish setting up</h2>
        <Link
          to="/app/settings"
          className="flex items-center gap-1 text-sm text-brand-text"
        >
          Continue <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="flex flex-wrap gap-5">
        {steps.map((step) => (
          <Link
            key={step.label}
            to={step.href}
            className="flex items-center gap-2 text-sm"
          >
            {step.done ? (
              <CheckCircle2 aria-hidden className="size-4 text-brand-text" />
            ) : (
              <Circle aria-hidden className="size-4 text-muted-foreground" />
            )}
            {step.label}
          </Link>
        ))}
      </div>
    </section>
  )
}
