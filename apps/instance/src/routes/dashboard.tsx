import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import { useApiQuery } from '@/lib/api'
import type { Church } from '@/lib/api-types'

export function DashboardPage() {
  const { data, isLoading } = useApiQuery<{ churches: Church[] }>('/api/churches')
  const churches = data?.churches ?? []

  return (
    <PageShell>
      <Section>
        <Eyebrow>Dashboard</Eyebrow>
        <h1>Fellowship42</h1>
        <p className="mt-2">Your church management platform</p>
      </Section>

      <Section title="Church" description="Open the church served by this independent instance.">
        <CardGrid>
          {isLoading ? (
            <Card className="flex flex-col items-center justify-center border-dashed p-8">
              <CardContent>
                <p className="text-center text-muted-foreground">Loading churches...</p>
              </CardContent>
            </Card>
          ) : churches.length > 0 ? (
            churches.map((church) => (
              <Link key={church.id} to={`/churches/${church.id}`}>
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
                  Your church is still in draft or unavailable to this account.
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
                <CardTitle>Church</CardTitle>
                <CardDescription>Open this instance's church workspace</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </CardGrid>
      </Section>
    </PageShell>
  )
}
