import { Link, useParams } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function PeoplePage() {
  const { churchId } = useParams<{ churchId: string }>()

  // TODO: Replace with useQuery(api.people.list, { churchId }) once Convex is connected
  const people: { _id: string; name: string; email?: string; role?: string }[] = []

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
        <p className="mt-2">Manage your church directory</p>
      </Section>

      <Section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Input placeholder="Search people..." className="max-w-sm" />
          <Button size="sm">Add person</Button>
        </div>

        {people.length > 0 ? (
          <CardGrid minWidth="280px">
            {people.map((person) => (
              <Card key={person._id}>
                <CardHeader>
                  <CardTitle>{person.name}</CardTitle>
                  {person.email && (
                    <CardDescription>{person.email}</CardDescription>
                  )}
                </CardHeader>
                {person.role && (
                  <CardContent>
                    <Badge variant="pill">{person.role}</Badge>
                  </CardContent>
                )}
              </Card>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center p-8 border-dashed">
            <CardContent>
              <p className="text-center text-muted-foreground">
                No people yet. Add members and contacts to build your directory.
              </p>
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm">
                  Add your first person
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
