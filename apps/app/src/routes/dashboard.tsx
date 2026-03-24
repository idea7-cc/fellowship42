import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

export function DashboardPage() {
  return (
    <PageShell>
      <Section>
        <Eyebrow>Dashboard</Eyebrow>
        <h1>Fellowship42</h1>
        <p className="mt-2">Your church management platform</p>
      </Section>

      <Section title="Your churches" description="Select a church to manage.">
        <CardGrid>
          <Card className="flex flex-col items-center justify-center p-8 border-dashed">
            <CardContent>
              <p className="text-center text-muted-foreground">
                Connect your Convex backend to see your churches here.
              </p>
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm">
                  Set up Convex
                </Button>
              </div>
            </CardContent>
          </Card>
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
