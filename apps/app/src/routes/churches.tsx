import { Link } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function ChurchesPage() {
  // TODO: Replace with useQuery(api.churches.list) once Convex is connected
  const churches: { _id: string; name: string; city?: string }[] = []

  return (
    <PageShell>
      <Section>
        <Eyebrow>Churches</Eyebrow>
        <h1>Your churches</h1>
        <p className="mt-2">Manage your church communities</p>
      </Section>

      <Section>
        <div className="mb-6 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm">
              Back to dashboard
            </Button>
          </Link>
          <Button size="sm">Add church</Button>
        </div>

        {churches.length > 0 ? (
          <CardGrid>
            {churches.map((church) => (
              <Link key={church._id} to={`/churches/${church._id}`}>
                <Card className="hover:-translate-y-px hover:shadow-md transition-all duration-200">
                  <CardHeader>
                    <CardTitle>{church.name}</CardTitle>
                    {church.city && (
                      <CardDescription>{church.city}</CardDescription>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center p-8 border-dashed">
            <CardContent>
              <p className="text-center text-muted-foreground">
                No churches yet. Connect your Convex backend to get started.
              </p>
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm">
                  Add your first church
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
