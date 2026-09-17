import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'

import { PageShell } from '@/components/page-shell'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export function NotFoundPage() {
  return (
    <PageShell width="narrow">
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          action={
            <Button asChild size="sm">
              <Link to="/">Church website</Link>
            </Button>
          }
          className="border-0 bg-transparent"
          description="The page you are looking for does not exist, or it has moved."
          icon={FileQuestion}
          title="Page not found"
        />
      </div>
    </PageShell>
  )
}
