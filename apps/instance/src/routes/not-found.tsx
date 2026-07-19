import { Link } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <PageShell>
      <Section className="flex flex-col items-center justify-center text-center min-h-[60vh]">
        <Eyebrow>404</Eyebrow>
        <h1>Page not found</h1>
        <p className="mt-4 max-w-md">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-8">
          <Link to="/">
            <Button>Back to dashboard</Button>
          </Link>
        </div>
      </Section>
    </PageShell>
  )
}
