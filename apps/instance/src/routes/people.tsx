import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { useAuthState } from '@/lib/auth-provider'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useApiQuery } from '@/lib/api'
import type { Church, Person } from '@/lib/api-types'

export function PeoplePage() {
  const { churchId } = useParams<{ churchId: string }>()
  const [search, setSearch] = useState('')
  const basePath = churchId ? `/api/churches/${encodeURIComponent(churchId)}` : null
  const churchQuery = useApiQuery<{ church: Church }>(basePath)
  const church = churchQuery.data?.church
  const { isSignedIn, isLoading: authLoading } = useAuthState()
  const peopleQuery = useApiQuery<{ people: Person[] }>(
    isSignedIn && churchId ? `/api/people/${encodeURIComponent(churchId)}` : null,
  )
  const people = peopleQuery.data?.people ?? []

  const filteredPeople =
    people.filter((person) => {
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
        <Eyebrow>People</Eyebrow>
        <h1>Members &amp; contacts</h1>
        <p className="mt-2">
          {church ? `Protected directory for ${church.name}` : 'Protected church directory'}
        </p>
      </Section>

      <Section>
        {authLoading || peopleQuery.isLoading ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">Loading directory access...</p>
            </CardContent>
          </Card>
        ) : !isSignedIn ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">
                People records stay private. Sign in to access this directory.
              </p>
            </CardContent>
          </Card>
        ) : peopleQuery.error?.status === 403 ? (
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
              <Card key={person.id}>
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
