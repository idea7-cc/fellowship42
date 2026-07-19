import { Link } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { useApiQuery } from '@/lib/api'
import type { Church } from '@/lib/api-types'

export function ChurchesPage() {
  const { data, isLoading } = useApiQuery<{ churches: Church[] }>('/api/churches')
  const churches = data?.churches ?? []

  return (
    <PageShell>
      <Section>
        <Eyebrow>Church instance</Eyebrow>
        <h1>Your church</h1>
        <p className="mt-2">This deployment is one portable church and one ownership boundary.</p>
      </Section>

      <Section>
        {isLoading ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">Loading churches...</p>
            </CardContent>
          </Card>
        ) : churches.length > 0 ? (
          <CardGrid>
            {churches.map((church) => (
              <Link key={church.id} to={`/churches/${church.id}`}>
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
                Your church is still in draft or unavailable to this account.
              </p>
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
