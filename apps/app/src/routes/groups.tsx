import { Link, useParams } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function GroupsPage() {
  const { churchId } = useParams<{ churchId: string }>()

  // TODO: Replace with useQuery(api.groups.list, { churchId }) once Convex is connected
  const groups: { _id: string; name: string; description?: string; memberCount?: number; type?: string }[] = []

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
        <Eyebrow>Groups</Eyebrow>
        <h1>Groups &amp; teams</h1>
        <p className="mt-2">Small groups, teams, and committees</p>
      </Section>

      <Section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Input placeholder="Search groups..." className="max-w-sm" />
          <Button size="sm">Create group</Button>
        </div>

        {groups.length > 0 ? (
          <CardGrid minWidth="280px">
            {groups.map((group) => (
              <Card key={group._id}>
                <CardHeader>
                  <CardTitle>{group.name}</CardTitle>
                  {group.description && (
                    <CardDescription>{group.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {group.type && <Badge variant="pill">{group.type}</Badge>}
                </CardContent>
                <CardFooter>
                  <span className="text-sm text-muted-foreground">
                    {group.memberCount ?? 0} members
                  </span>
                </CardFooter>
              </Card>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center p-8 border-dashed">
            <CardContent>
              <p className="text-center text-muted-foreground">
                No groups yet. Create small groups, teams, or committees.
              </p>
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm">
                  Create your first group
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
