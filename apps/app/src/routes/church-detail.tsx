import { Link, useParams } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Hero } from '@/components/hero'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatPanel } from '@/components/stat-panel'

export function ChurchDetailPage() {
  const { churchId } = useParams<{ churchId: string }>()

  // TODO: Replace with useQuery(api.churches.get, { id: churchId }) once Convex is connected
  const church = {
    _id: churchId,
    name: 'Your Church',
    city: 'City, State',
  }

  const navItems = [
    { label: 'People', description: 'Members, visitors, and contacts', path: 'people' },
    { label: 'Groups', description: 'Small groups, teams, and committees', path: 'groups' },
    { label: 'Courses', description: 'Classes, studies, and training', path: 'courses' },
    { label: 'Events', description: 'Services, gatherings, and activities', path: 'events' },
  ]

  return (
    <PageShell>
      <Section>
        <Link to="/churches">
          <Button variant="ghost" size="sm">
            Back to churches
          </Button>
        </Link>
      </Section>

      <Hero variant="church">
        <Eyebrow>Church overview</Eyebrow>
        <h1>{church.name}</h1>
        <p className="mt-2">{church.city}</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <StatPanel
            stats={[
              { label: 'Active members', value: '--' },
              { label: 'Groups', value: '--' },
              { label: 'Upcoming events', value: '--' },
            ]}
          />
        </div>
      </Hero>

      <Section title="Manage" description="Select an area to manage.">
        <CardGrid>
          {navItems.map((item) => (
            <Link key={item.path} to={`/churches/${churchId}/${item.path}`}>
              <Card className="hover:-translate-y-px hover:shadow-md transition-all duration-200 h-full">
                <CardHeader>
                  <CardTitle>{item.label}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </CardGrid>
      </Section>
    </PageShell>
  )
}
