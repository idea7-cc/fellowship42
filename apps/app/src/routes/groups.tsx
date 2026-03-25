import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@convex/_generated/api'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { asId } from '@/lib/convex'

export function GroupsPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const [search, setSearch] = useState('')
  const churchArgs = churchId ? { churchId: asId<'churches'>(churchId) } : 'skip'
  const church = useQuery(api.churches.getPublishedById, churchArgs)
  const groups = useQuery(api.groups.listByChurch, churchArgs)
  const filteredGroups =
    groups?.filter((group) => {
      const query = search.trim().toLowerCase()
      if (!query) {
        return true
      }

      return [group.title, group.summary, group.groupType, group.schedule, group.location]
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
        <Eyebrow>Groups</Eyebrow>
        <h1>Groups &amp; teams</h1>
        <p className="mt-2">
          {church ? `Published groups for ${church.name}` : 'Published groups and teams'}
        </p>
      </Section>

      <Section>
        {groups === undefined ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">Loading groups...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search groups..."
                className="max-w-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button size="sm" disabled>
                Group creation requires auth
              </Button>
            </div>

        {filteredGroups.length > 0 ? (
          <CardGrid minWidth="280px">
            {filteredGroups.map((group) => (
              <Card key={group._id}>
                <CardHeader>
                  <CardTitle>{group.title}</CardTitle>
                  {group.summary && (
                    <CardDescription>{group.summary}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="pill">{group.groupType}</Badge>
                    {group.openEnrollment ? <Badge variant="outline">Open enrollment</Badge> : null}
                  </div>
                </CardContent>
                <CardFooter>
                  <span className="text-sm text-muted-foreground">
                    {group.location ? `${group.location} · ` : ''}{group.schedule}
                  </span>
                </CardFooter>
              </Card>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">
                {groups.length > 0
                  ? 'No groups match your current search.'
                  : 'No published groups are available for this church yet.'}
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
