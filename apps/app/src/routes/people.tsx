import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@convex/_generated/api'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { asId } from '@/lib/convex'

export function PeoplePage() {
  const { churchId } = useParams<{ churchId: string }>()
  const [search, setSearch] = useState('')
  const churchArgs = churchId ? { churchId: asId<'churches'>(churchId) } : 'skip'
  const church = useQuery(api.churches.getPublishedById, churchArgs)
  const viewer = useQuery(api.users.getCurrent)
  const people = useQuery(api.people.listByChurchForViewer, churchArgs)

  const filteredPeople =
    people?.filter((person) => {
      const query = search.trim().toLowerCase()
      if (!query) {
        return true
      }

      return [
        `${person.firstName} ${person.lastName}`,
        person.email,
        person.membershipStatus,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    }) ?? []

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
        <Eyebrow>People</Eyebrow>
        <h1>Members &amp; contacts</h1>
        <p className="mt-2">
          {church ? `Protected directory for ${church.name}` : 'Protected church directory'}
        </p>
      </Section>

      <Section>
        {viewer === undefined || people === undefined ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">Loading directory access...</p>
            </CardContent>
          </Card>
        ) : !viewer ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">
                People records stay private. Configure Clerk auth and sign in to use this route.
              </p>
            </CardContent>
          </Card>
        ) : people === null ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">
                Your account does not currently have access to this church directory.
              </p>
            </CardContent>
          </Card>
        ) : filteredPeople.length > 0 ? (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search people..."
                className="max-w-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button size="sm" disabled>
                Person creation requires auth flows
              </Button>
            </div>
          <CardGrid minWidth="280px">
            {filteredPeople.map((person) => (
              <Card key={person._id}>
                <CardHeader>
                  <CardTitle>{person.firstName} {person.lastName}</CardTitle>
                  {person.email && (
                    <CardDescription>{person.email}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge variant="pill">{person.membershipStatus}</Badge>
                  {person.volunteerReady ? <Badge variant="outline">Volunteer-ready</Badge> : null}
                </CardContent>
              </Card>
            ))}
          </CardGrid>
          </>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search people..."
                className="max-w-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button size="sm" disabled>
                Person creation requires auth flows
              </Button>
            </div>
            <Card className="flex flex-col items-center justify-center border-dashed p-8">
              <CardContent>
                <p className="text-center text-muted-foreground">
                  {people.length > 0
                    ? 'No people match your current search.'
                    : 'No people records are available for this church yet.'}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </Section>
    </PageShell>
  )
}
