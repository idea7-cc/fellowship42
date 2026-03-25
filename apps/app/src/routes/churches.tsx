import { useQuery } from 'convex/react'
import { Link } from 'react-router-dom'
import { api } from '@convex/_generated/api'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function ChurchesPage() {
  const churches = useQuery(api.churches.list)

  return (
    <PageShell>
      <Section>
        <Eyebrow>Churches</Eyebrow>
        <h1>Published churches</h1>
        <p className="mt-2">Browse the church records available in this deployment.</p>
      </Section>

      <Section>
        <div className="mb-6 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm">
              Back to dashboard
            </Button>
          </Link>
          <Button size="sm" disabled>
            Church creation requires auth
          </Button>
        </div>

        {churches === undefined ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">Loading churches...</p>
            </CardContent>
          </Card>
        ) : churches.length > 0 ? (
          <CardGrid>
            {churches.map((church) => (
              <Link key={church._id} to={`/churches/${church._id}`}>
                <Card className="transition-all duration-200 hover:-translate-y-px hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{church.name}</CardTitle>
                    <CardDescription>{church.summary}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center p-8 border-dashed">
            <CardContent>
              <p className="text-center text-muted-foreground">
                No published churches are available yet.
              </p>
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
