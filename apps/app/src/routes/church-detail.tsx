import { useQuery } from 'convex/react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@convex/_generated/api'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Hero } from '@/components/hero'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatPanel } from '@/components/stat-panel'
import { asId } from '@/lib/convex'

export function ChurchDetailPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const churchArgs = churchId ? { churchId: asId<'churches'>(churchId) } : 'skip'
  const church = useQuery(api.churches.getPublishedById, churchArgs)
  const groups = useQuery(api.groups.listByChurch, churchArgs)
  const courses = useQuery(api.courses.listByChurch, churchArgs)
  const events = useQuery(api.events.listByChurch, churchArgs)

  const navItems = [
    {
      label: 'People',
      description: 'Protected directory view. Available after Clerk auth is wired.',
      path: 'people',
      disabled: true,
    },
    {
      label: 'Groups',
      description: 'Small groups, teams, and committees',
      path: 'groups',
    },
    {
      label: 'Courses',
      description: 'Classes, studies, and training',
      path: 'courses',
    },
    {
      label: 'Events',
      description: 'Services, gatherings, and activities',
      path: 'events',
    },
  ]

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
      <Section>
        <Link to="/churches">
          <Button variant="ghost" size="sm">
            Back to churches
          </Button>
        </Link>
      </Section>

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

          <Section title="Areas" description="Browse the surfaces currently backed by live Convex data.">
            <CardGrid>
              {navItems.map((item) =>
                item.disabled ? (
                  <Card key={item.path} className="h-full border-dashed opacity-80">
                    <CardHeader>
                      <CardTitle>{item.label}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ) : (
                  <Link key={item.path} to={`/churches/${churchId}/${item.path}`}>
                    <Card className="h-full transition-all duration-200 hover:-translate-y-px hover:shadow-md">
                      <CardHeader>
                        <CardTitle>{item.label}</CardTitle>
                        <CardDescription>{item.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ),
              )}
            </CardGrid>
          </Section>
        </>
      )}
    </PageShell>
  )
}
