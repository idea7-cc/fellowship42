import { useQuery } from 'convex/react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@convex/_generated/api'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Hero } from '@/components/hero'
import { Eyebrow } from '@/components/eyebrow'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { asId } from '@/lib/convex'

export function CourseDetailPage() {
  const { churchId, slug } = useParams<{ churchId: string; slug: string }>()
  const churchArgs = churchId ? { churchId: asId<'churches'>(churchId) } : 'skip'
  const church = useQuery(api.churches.getPublishedById, churchArgs)
  const course = useQuery(
    api.courses.getBySlug,
    churchId && slug ? { churchId: asId<'churches'>(churchId), slug } : 'skip',
  )
  const lessons = course?.lessons ?? []

  return (
    <PageShell>
      <Section>
        <Link to={`/churches/${churchId}/courses`}>
          <Button variant="ghost" size="sm">
            Back to courses
          </Button>
        </Link>
      </Section>

      {course === undefined ? (
        <Section>
          <Card>
            <CardHeader>
              <CardTitle>Loading course...</CardTitle>
              <CardDescription>Fetching course content from Convex.</CardDescription>
            </CardHeader>
          </Card>
        </Section>
      ) : !course ? (
        <Section>
          <Card>
            <CardHeader>
              <CardTitle>Course not found</CardTitle>
              <CardDescription>
                This route only shows published courses available from the active Convex deployment.
              </CardDescription>
            </CardHeader>
          </Card>
        </Section>
      ) : (
        <>
          <Hero variant="landing">
            <Eyebrow>Course</Eyebrow>
            <h1>{course.title}</h1>
            <p className="mt-2">{course.summary}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Badge variant="pill">{course.courseType}</Badge>
              <Badge variant="outline">{course.deliveryMode}</Badge>
              <span className="text-sm text-muted-foreground">
                {lessons.length} lessons
              </span>
              {church ? (
                <span className="text-sm text-muted-foreground">for {church.name}</span>
              ) : null}
            </div>
          </Hero>

          <Section title="Lessons" description="Course content and materials.">
            {lessons.length > 0 ? (
              <div className="grid gap-3">
                {lessons.map((lesson, index) => (
                  <div key={lesson.lessonId}>
                    <Card className="transition-all duration-200 hover:-translate-y-px hover:shadow-md">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-accent-strong">
                              {index + 1}
                            </span>
                            <div>
                              <CardTitle>{lesson.title}</CardTitle>
                              <CardDescription>{lesson.summary}</CardDescription>
                            </div>
                          </div>
                          {lesson.estimatedMinutes ? (
                            <CardDescription>{lesson.estimatedMinutes} min</CardDescription>
                          ) : null}
                        </div>
                      </CardHeader>
                      {lesson.required ? (
                        <CardContent>
                          <Badge variant="outline">Required</Badge>
                        </CardContent>
                      ) : null}
                    </Card>
                    {index < lessons.length - 1 ? <Separator className="my-1" /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <Card className="flex flex-col items-center justify-center border-dashed p-8">
                <CardContent>
                  <p className="text-center text-muted-foreground">
                    This course does not have any lessons yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </Section>
        </>
      )}
    </PageShell>
  )
}
