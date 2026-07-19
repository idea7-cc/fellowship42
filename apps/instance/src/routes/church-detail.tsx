import { useParams } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Hero } from '@/components/hero'
import { Eyebrow } from '@/components/eyebrow'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatPanel } from '@/components/stat-panel'
import { useApiQuery } from '@/lib/api'
import type { Church, Course, EventRecord, Group } from '@/lib/api-types'

export function ChurchDetailPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const basePath = churchId ? `/api/churches/${encodeURIComponent(churchId)}` : null
  const churchQuery = useApiQuery<{ church: Church }>(basePath)
  const groupQuery = useApiQuery<{ groups: Group[] }>(basePath ? `${basePath}/groups` : null)
  const courseQuery = useApiQuery<{ courses: Course[] }>(basePath ? `${basePath}/courses` : null)
  const eventQuery = useApiQuery<{ events: EventRecord[] }>(basePath ? `${basePath}/events` : null)
  const church = churchQuery.data?.church
  const groups = groupQuery.data?.groups ?? []
  const courses = courseQuery.data?.courses ?? []
  const events = eventQuery.data?.events ?? []

  const isLoading =
    churchQuery.isLoading || groupQuery.isLoading || courseQuery.isLoading || eventQuery.isLoading

  if (!churchId) {
    return null
  }

  return (
    <PageShell>
      {isLoading ? (
        <Section>
          <Card>
            <CardHeader>
              <CardTitle>Loading church...</CardTitle>
              <CardDescription>Fetching published church data from Cloudflare.</CardDescription>
            </CardHeader>
          </Card>
        </Section>
      ) : !church ? (
        <Section>
          <Card>
            <CardHeader>
              <CardTitle>Church not found</CardTitle>
              <CardDescription>
                This route only shows published churches available in this deployment.
              </CardDescription>
            </CardHeader>
          </Card>
        </Section>
      ) : (
        <>
          <Hero variant="church">
            <Eyebrow>Church overview</Eyebrow>
            <h1>{church.name}</h1>
            <p className="mt-2">{church.tagline}</p>
            <p className="mt-4 max-w-2xl text-balance text-sm text-muted-foreground">
              {church.summary}
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <StatPanel
                stats={[
                  { label: 'Published groups', value: String(groups.length) },
                  { label: 'Published courses', value: String(courses.length) },
                  { label: 'Upcoming events', value: String(events.length) },
                ]}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Location</CardTitle>
                  <CardDescription>
                    {church.address.city}, {church.address.state}
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </Hero>
        </>
      )}
    </PageShell>
  )
}
