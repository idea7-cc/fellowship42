import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  GraduationCap,
  HandCoins,
  Mic,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

import { PageShell } from '@/components/page-shell'
import { PageHeader } from '@/components/page-header'
import { Section } from '@/components/section'
import { Metric, MetricRow } from '@/components/metric'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/badge'
import { useApiQuery } from '@/lib/api'
import type { Church, Course, EventRecord, Group } from '@/lib/api-types'

interface Shortcut {
  label: string
  description: string
  path: string
  icon: LucideIcon
}

const shortcuts: Shortcut[] = [
  { label: 'People', description: 'Directory, households, and care notes', path: '/people', icon: Users },
  { label: 'Groups', description: 'Small groups and enrollment', path: '/groups', icon: UsersRound },
  { label: 'Courses', description: 'Classes, lessons, and cohorts', path: '/courses', icon: GraduationCap },
  { label: 'Events', description: 'Calendar and registrations', path: '/events', icon: CalendarDays },
  { label: 'Sermons', description: 'Series, audio, and transcripts', path: '/sermons', icon: Mic },
  { label: 'Contributions', description: 'Giving, funds, and delivery', path: '/contributions', icon: HandCoins },
]

export function DashboardPage() {
  const { data, isLoading } = useApiQuery<{ churches: Church[] }>('/api/churches')
  const church = data?.churches?.[0]
  const basePath = church ? `/api/churches/${encodeURIComponent(church.id)}` : null

  const groupQuery = useApiQuery<{ groups: Group[] }>(basePath ? `${basePath}/groups` : null)
  const courseQuery = useApiQuery<{ courses: Course[] }>(basePath ? `${basePath}/courses` : null)
  const eventQuery = useApiQuery<{ events: EventRecord[] }>(basePath ? `${basePath}/events` : null)

  const countsLoading = groupQuery.isLoading || courseQuery.isLoading || eventQuery.isLoading

  return (
    <PageShell>
      <PageHeader
        eyebrow="This instance"
        title={church?.name ?? 'Fellowship42'}
        description={
          church
            ? church.tagline
            : 'One deployment, one church, one ownership boundary.'
        }
        actions={
          church ? (
            <StatusBadge status={church.status} />
          ) : null
        }
      />

      {isLoading ? (
        <MetricRow className="lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton className="h-[5.25rem]" key={index} />
          ))}
        </MetricRow>
      ) : !church ? (
        <EmptyState
          title="No church is published yet"
          description="This instance is running, but its church record is still in draft or is not visible to your account."
        />
      ) : (
        <>
          <MetricRow className="lg:grid-cols-3">
            <Metric
              icon={UsersRound}
              label="Published groups"
              value={countsLoading ? '—' : groupQuery.data?.groups.length ?? 0}
              hint="Visible to members"
            />
            <Metric
              icon={GraduationCap}
              label="Published courses"
              value={countsLoading ? '—' : courseQuery.data?.courses.length ?? 0}
              hint="Open for enrollment"
            />
            <Metric
              icon={CalendarDays}
              label="Upcoming events"
              value={countsLoading ? '—' : eventQuery.data?.events.length ?? 0}
              hint="On the public calendar"
            />
          </MetricRow>

          <Section title="Go to" description="Every module in this church workspace.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shortcuts.map((shortcut) => {
                const Icon = shortcut.icon
                return (
                  <Link key={shortcut.path} to={`/churches/${church.id}${shortcut.path}`}>
                    <Card className="group h-full" interactive>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Icon aria-hidden className="size-4 text-muted-foreground" />
                          <CardTitle>{shortcut.label}</CardTitle>
                          <ArrowRight
                            aria-hidden
                            className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </div>
                        <CardDescription>{shortcut.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </Section>
        </>
      )}
    </PageShell>
  )
}
