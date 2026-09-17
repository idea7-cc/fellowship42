import { ArrowLeft, Church as ChurchIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { ChurchSite } from '../../contracts/church-settings'
import type { CourseDetailResponse } from '@/lib/api-types'
import { useApiQuery } from '@/lib/api'
import { useChurch } from '@/lib/church-context'
import { ChurchWebsite } from '@/components/church-site'
import { ChurchTheme } from '@/components/church-theme'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function SiteLoading() {
  return (
    <main aria-label="Loading website" className="mx-auto max-w-6xl p-8">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-16 h-96" />
    </main>
  )
}
function SiteUnavailable({
  failed,
  retry,
}: {
  failed: boolean
  retry: () => void
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
      <ChurchIcon aria-hidden className="size-9 text-muted-foreground" />
      <h1>{failed ? 'Unable to load this website' : 'See you soon'}</h1>
      <p className="text-sm text-muted-foreground">
        {failed
          ? 'Please try again.'
          : 'This church’s website is not published yet.'}
      </p>
      {failed ? (
        <Button onClick={retry}>Try again</Button>
      ) : (
        <Button asChild variant="ghost">
          <Link to="/app">Staff sign in</Link>
        </Button>
      )}
    </main>
  )
}
export function PublicSitePage() {
  const query = useApiQuery<ChurchSite>('/api/site')
  if (query.isLoading) return <SiteLoading />
  if (!query.data)
    return (
      <SiteUnavailable
        failed={query.error?.status !== 404}
        retry={() => void query.refetch()}
      />
    )
  return <ChurchWebsite site={query.data} />
}
export function SitePreviewPage() {
  const { churchId } = useChurch()
  const query = useApiQuery<ChurchSite>(
    `/api/church-settings/${encodeURIComponent(churchId)}/preview`,
  )
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-5 py-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/settings">
            <ArrowLeft aria-hidden />
            Settings
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">
          Saved draft · Preview
        </span>
      </div>
      {query.isLoading ? (
        <SiteLoading />
      ) : query.data ? (
        <ChurchWebsite site={query.data} preview />
      ) : (
        <div className="p-8" role="alert">
          {query.error?.message ?? 'Preview unavailable'}
        </div>
      )}
    </>
  )
}
export function PublicCoursePage() {
  const { slug } = useParams()
  const site = useApiQuery<ChurchSite>('/api/site')
  const course = useApiQuery<CourseDetailResponse>(
    site.data && slug
      ? `/api/churches/${encodeURIComponent(site.data.church.id)}/courses/${encodeURIComponent(slug)}`
      : null,
  )
  if (site.isLoading || course.isLoading) return <SiteLoading />
  if (!site.data)
    return (
      <SiteUnavailable
        failed={site.error?.status !== 404}
        retry={() => void site.refetch()}
      />
    )
  return (
    <ChurchTheme
      scope="surface"
      theme={site.data.church.theme}
      className="min-h-screen bg-background text-foreground"
    >
      <main className="mx-auto max-w-3xl px-5 py-8">
        <Button asChild size="sm" variant="ghost">
          <Link to="/">
            <ArrowLeft aria-hidden />
            {site.data.church.name}
          </Link>
        </Button>
        {course.data ? (
          <>
            <h1 className="mt-10 text-3xl">{course.data.course.title}</h1>
            <p className="mt-4 text-muted-foreground">
              {course.data.course.summary}
            </p>
            <div className="mt-10 divide-y divide-border">
              {course.data.lessons.map((lesson) => (
                <section key={lesson.id} className="py-7">
                  <h2 className="text-xl">{lesson.title}</h2>
                  <p className="mt-3 whitespace-pre-wrap leading-relaxed">
                    {lesson.content || lesson.summary}
                  </p>
                  {lesson.mediaId && (
                    <Button asChild className="mt-4" variant="secondary">
                      <a
                        href={`/media/${encodeURIComponent(lesson.mediaId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open lesson media
                      </a>
                    </Button>
                  )}
                </section>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-10" role="alert">
            {course.error?.message ?? 'Course not found'}
          </p>
        )}
      </main>
    </ChurchTheme>
  )
}
