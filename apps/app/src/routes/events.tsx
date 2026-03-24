import { Link, useParams } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function EventsPage() {
  const { churchId } = useParams<{ churchId: string }>()

  // TODO: Replace with useQuery(api.events.list, { churchId }) once Convex is connected
  const events: { _id: string; title: string; date?: string; location?: string; type?: string }[] = []

  return (
    <PageShell>
      <Section>
        <Link to={`/churches/${churchId}`}>
          <Button variant="ghost" size="sm">
            Back to church
          </Button>
        </Link>
      </Section>

      <Section>
        <Eyebrow>Events</Eyebrow>
        <h1>Events &amp; services</h1>
        <p className="mt-2">Services, gatherings, and church activities</p>
      </Section>

      <Section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Input placeholder="Search events..." className="max-w-sm" />
          <Button size="sm">Create event</Button>
        </div>

        {events.length > 0 ? (
          <CardGrid minWidth="280px">
            {events.map((event) => (
              <Card key={event._id}>
                <CardHeader>
                  <CardTitle>{event.title}</CardTitle>
                  {event.date && (
                    <CardDescription>{event.date}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2">
                    {event.type && <Badge variant="pill">{event.type}</Badge>}
                    {event.location && (
                      <span className="text-sm text-muted-foreground">{event.location}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center p-8 border-dashed">
            <CardContent>
              <p className="text-center text-muted-foreground">
                No events yet. Create services, gatherings, or activities.
              </p>
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm">
                  Create your first event
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
