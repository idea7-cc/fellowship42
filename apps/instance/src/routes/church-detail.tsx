import { useParams } from 'react-router-dom'
import {
  CalendarDays,
  Clock,
  ExternalLink,
  Eye,
  Globe,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

import { PageShell } from '@/components/page-shell'
import { PageHeader } from '@/components/page-header'
import { Section } from '@/components/section'
import { Hero } from '@/components/hero'
import { Metric, MetricRow } from '@/components/metric'
import { ChurchTheme } from '@/components/church-theme'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useApiQuery } from '@/lib/api'
import type { Church, Course, EventRecord, Group, ServiceTime } from '@/lib/api-types'

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function ChurchDetailPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const basePath = churchId ? `/api/churches/${encodeURIComponent(churchId)}` : null
  const churchQuery = useApiQuery<{ church: Church }>(basePath)
  const groupQuery = useApiQuery<{ groups: Group[] }>(basePath ? `${basePath}/groups` : null)
  const courseQuery = useApiQuery<{ courses: Course[] }>(basePath ? `${basePath}/courses` : null)
  const eventQuery = useApiQuery<{ events: EventRecord[] }>(basePath ? `${basePath}/events` : null)

  const church = churchQuery.data?.church
  const countsLoading = groupQuery.isLoading || courseQuery.isLoading || eventQuery.isLoading

  if (!churchId) return null

  if (churchQuery.isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-6 h-44 w-full" />
        <MetricRow className="mt-6 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton className="h-[5.25rem]" key={index} />
          ))}
        </MetricRow>
      </PageShell>
    )
  }

  if (!church) {
    return (
      <PageShell>
        <EmptyState
          title="Church not found"
          description="This route only shows published churches available in this deployment."
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Church overview"
        title={church.name}
        description={church.tagline}
        actions={
          <>
            <StatusBadge status={church.status} />
            {church.givingUrl ? (
              <Button asChild size="sm" variant="secondary">
                <a href={church.givingUrl} rel="noreferrer" target="_blank">
                  Giving page
                  <ExternalLink />
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      {/*
        The one full-brand region on an operator screen: a preview of how the
        congregation presents itself. Everything outside it stays neutral.

        It is framed as a preview rather than rendered edge to edge. The church
        brand is a light palette, so an unframed panel became a glaring white
        slab in dark mode that dominated the page — it read as a broken surface
        instead of as a preview of someone else's site.
      */}
      <figure className="overflow-hidden rounded-lg border border-border">
        <figcaption className="flex items-center gap-2 border-b border-border bg-surface-sunken px-3 py-2">
          <Eye aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Public appearance — how members and visitors see this church
          </span>
        </figcaption>
        <ChurchTheme scope="surface" theme={church.theme}>
          <Hero className="rounded-none border-0" variant="church">
            <h2 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
              {church.name}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm opacity-80">{church.summary}</p>
            {church.serviceTimes.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                {church.serviceTimes.map((service: ServiceTime) => (
                  <span className="inline-flex items-center gap-1.5 text-sm" key={service.id}>
                    <Clock aria-hidden className="size-3.5 opacity-60" />
                    <span className="font-medium">{service.label}</span>
                    <span className="opacity-70">
                      {dayNames[service.day] ?? ''} {service.time}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </Hero>
        </ChurchTheme>
      </figure>

      <Section className="mt-6">
        <MetricRow className="lg:grid-cols-3">
          <Metric
            hint="Visible to members"
            icon={UsersRound}
            label="Published groups"
            value={countsLoading ? '—' : (groupQuery.data?.groups.length ?? 0)}
          />
          <Metric
            hint="Open for enrollment"
            icon={GraduationCap}
            label="Published courses"
            value={countsLoading ? '—' : (courseQuery.data?.courses.length ?? 0)}
          />
          <Metric
            hint="On the public calendar"
            icon={CalendarDays}
            label="Upcoming events"
            value={countsLoading ? '—' : (eventQuery.data?.events.length ?? 0)}
          />
        </MetricRow>
      </Section>

      <Section title="Details">
        <Card>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <DetailRow icon={MapPin} label="Address">
              {[
                church.address.street,
                [church.address.city, church.address.state].filter(Boolean).join(', '),
                church.address.postalCode,
              ]
                .filter(Boolean)
                .join(' · ') || 'Not set'}
            </DetailRow>
            <DetailRow icon={Clock} label="Timezone">
              {church.timezone || 'Not set'}
            </DetailRow>
            <DetailRow icon={Mail} label="Email">
              {church.contact.email ? (
                <a
                  className="text-brand-text hover:underline"
                  href={`mailto:${church.contact.email}`}
                >
                  {church.contact.email}
                </a>
              ) : (
                'Not set'
              )}
            </DetailRow>
            <DetailRow icon={Phone} label="Phone">
              {church.contact.phone || 'Not set'}
            </DetailRow>
            <DetailRow icon={Globe} label="Website">
              {church.contact.website ? (
                <a
                  className="text-brand-text hover:underline"
                  href={church.contact.website}
                  rel="noreferrer"
                  target="_blank"
                >
                  {church.contact.website}
                </a>
              ) : (
                'Not set'
              )}
            </DetailRow>
          </dl>
        </Card>
      </Section>
    </PageShell>
  )
}

function DetailRow({
  children,
  icon: Icon,
  label,
}: {
  children: React.ReactNode
  icon: LucideIcon
  label: string
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  )
}
