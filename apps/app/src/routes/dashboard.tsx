import { useQuery } from 'convex/react'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import { api } from '@convex/_generated/api'

export function DashboardPage() {
  const churches = useQuery(api.churches.list)

  return (
    <PageShell>
      <Section>
        <Eyebrow>Dashboard</Eyebrow>
        <h1>Fellowship42</h1>
        <p className="mt-2">Your church management platform</p>
      </Section>

      <Section title="Churches" description="Browse the published churches available in this Convex deployment.">
        <CardGrid>
          {churches === undefined ? (
            <Card className="flex flex-col items-center justify-center border-dashed p-8">
              <CardContent>
                <p className="text-center text-muted-foreground">Loading churches...</p>
              </CardContent>
            </Card>
          ) : churches.length > 0 ? (
            churches.map((church) => (
              <Link key={church._id} to={`/churches/${church._id}`}>
                <Card className="h-full transition-all duration-200 hover:-translate-y-px hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{church.name}</CardTitle>
                    <CardDescription>{church.summary}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))
          ) : (
            <Card className="flex flex-col items-center justify-center border-dashed p-8">
              <CardContent>
                <p className="text-center text-muted-foreground">
                  No published churches are available yet.
                </p>
              </CardContent>
            </Card>
          )}
        </CardGrid>
      </Section>

      <Section title="Quick actions">
        <CardGrid>
          <Link to="/churches">
            <Card className="hover:-translate-y-px hover:shadow-md transition-all duration-200">
              <CardHeader>
                <CardTitle>Churches</CardTitle>
                <CardDescription>Browse and manage your churches</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </CardGrid>
      </Section>
    </PageShell>
  )
}
