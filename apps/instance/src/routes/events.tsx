import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useApiQuery } from '@/lib/api'
import type { Church, EventRecord } from '@/lib/api-types'
import { formatTimestamp } from '@/lib/format'

export function EventsPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const [search, setSearch] = useState('')
  const basePath = churchId ? `/api/churches/${encodeURIComponent(churchId)}` : null
  const churchQuery = useApiQuery<{ church: Church }>(basePath)
  const eventQuery = useApiQuery<{ events: EventRecord[] }>(basePath ? `${basePath}/events` : null)
  const church = churchQuery.data?.church
  const events = eventQuery.data?.events ?? []
  const filteredEvents =
    events.filter((event) => {
      const query = search.trim().toLowerCase()
      if (!query) {
        return true
      }

      return [event.title, event.summary, event.location]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    }) ?? []

  return (
    <PageShell>
      <Section>
        <Eyebrow>Events</Eyebrow>
        <h1>Events &amp; services</h1>
        <p className="mt-2">
          {church ? `Upcoming events for ${church.name}` : 'Upcoming events and services'}
        </p>
      </Section>

      <Section>
        {eventQuery.isLoading ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">Loading events...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search events..."
                className="max-w-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button size="sm" disabled>
                Event creation requires auth
              </Button>
            </div>

        {filteredEvents.length > 0 ? (
          <CardGrid minWidth="280px">
            {filteredEvents.map((event) => (
              <Card key={event.id}>
                <CardHeader>
                  <CardTitle>{event.title}</CardTitle>
                  <CardDescription>{formatTimestamp(event.startDate)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2">
                    {event.featured ? <Badge variant="pill">Featured</Badge> : null}
                    <span className="text-sm text-muted-foreground">{event.location}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">
                {events.length > 0
                  ? 'No events match your current search.'
                  : 'No published upcoming events are available for this church yet.'}
              </p>
            </CardContent>
          </Card>
        )}
          </>
        )}
      </Section>
    </PageShell>
  )
}
