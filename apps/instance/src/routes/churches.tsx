import { Link } from 'react-router-dom'
import { ChevronRight, MapPin } from 'lucide-react'

import { PageShell } from '@/components/page-shell'
import { PageHeader } from '@/components/page-header'
import { CardGrid } from '@/components/card-grid'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCards } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/badge'
import { ChurchTheme } from '@/components/church-theme'
import { useApiQuery } from '@/lib/api'
import type { Church } from '@/lib/api-types'

export function ChurchesPage() {
  const { data, isLoading } = useApiQuery<{ churches: Church[] }>('/api/churches')
  const churches = data?.churches ?? []

  return (
    <PageShell>
      <PageHeader
        eyebrow="Church instance"
        title="Your church"
        description="This deployment is one portable church and one ownership boundary."
      />

      {isLoading ? (
        <SkeletonCards count={2} />
      ) : churches.length > 0 ? (
        <CardGrid minWidth="320px">
          {churches.map((church) => (
            <ChurchTheme key={church.id} theme={church.theme}>
              <Link to={`/churches/${church.id}`}>
                <Card className="group h-full" interactive>
                  <CardHeader>
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
                        style={{
                          background: 'var(--church-accent)',
                          color: 'var(--church-accent-contrast)',
                        }}
                      >
                        {church.name.charAt(0).toUpperCase()}
                      </span>
                      <CardTitle className="min-w-0 flex-1 truncate">{church.name}</CardTitle>
                      <ChevronRight
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </div>
                    <CardDescription className="mt-1.5 line-clamp-2">
                      {church.summary}
                    </CardDescription>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge size="sm" status={church.status} />
                      {church.address.city ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin aria-hidden className="size-3" />
                          {church.address.city}
                          {church.address.state ? `, ${church.address.state}` : ''}
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            </ChurchTheme>
          ))}
        </CardGrid>
      ) : (
        <EmptyState
          title="No church is available"
          description="Your church is still in draft, or this account does not have access to it yet."
        />
      )}
    </PageShell>
  )
}
