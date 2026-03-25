import { useQuery } from 'convex/react'
import { useParams } from 'react-router-dom'
import { api } from '@convex/_generated/api'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Hero } from '@/components/hero'
import { Eyebrow } from '@/components/eyebrow'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatPanel } from '@/components/stat-panel'
import { asId } from '@/lib/convex'

export function ChurchDetailPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const churchArgs = churchId ? { churchId: asId<'churches'>(churchId) } : 'skip'
  const church = useQuery(api.churches.getPublishedById, churchArgs)
  const groups = useQuery(api.groups.listByChurch, churchArgs)
  const courses = useQuery(api.courses.listByChurch, churchArgs)
  const events = useQuery(api.events.listByChurch, churchArgs)

  const isLoading =
    church === undefined ||
    groups === undefined ||
    courses === undefined ||
    events === undefined

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
              <CardDescription>Fetching published church data from Convex.</CardDescription>
            </CardHeader>
          </Card>
        </Section>
      ) : !church ? (
        <Section>
          <Card>
            <CardHeader>
              <CardTitle>Church not found</CardTitle>
              <CardDescription>
                This route only shows published churches available from the active Convex deployment.
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
