import Link from 'next/link'
import { notFound } from 'next/navigation'

import { toggleLessonCompletionAction } from '@/app/(frontend)/portal/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CardGrid } from '@/components/card-grid'
import { Eyebrow } from '@/components/eyebrow'
import { HeroActions } from '@/components/hero'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { SignOutButton } from '@/components/SignOutButton'
import { getCourseForUser } from '@/lib/portal'
import { requireSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{
    slug: string
  }>
}

export default async function CoursePortalPage({ params }: Args) {
  const user = await requireSessionUser()
  const { slug } = await params
  const courseData = await getCourseForUser(user, slug)

  if (!courseData) {
    notFound()
  }

  const { course, enrollment } = courseData
  const completedLessonIDs = new Set(
    (enrollment?.completedLessons ?? []).map((lesson) => lesson.lessonID),
  )

  return (
    <PageShell padBottom>
      <Section>
        <Eyebrow>Course workspace</Eyebrow>
        <h1>{course.title}</h1>
        <p className="mt-2">{course.summary}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {course.duration} · {course.deliveryMode.replace('-', ' ')} ·{' '}
          {enrollment?.progressPercent ?? 0}% complete
        </p>
        <HeroActions>
          <Button asChild variant="secondary">
            <Link href="/portal">Back to portal</Link>
          </Button>
          <SignOutButton />
        </HeroActions>
      </Section>

      <Section
        description="Track lesson completion individually while keeping the course content centrally managed."
        title="Lessons"
      >
        <CardGrid>
          {course.lessons?.map((lesson) => {
            const lessonID = lesson.id ?? `${course.slug ?? 'course'}-${lesson.title}`
            const isComplete = completedLessonIDs.has(lessonID)

            return (
              <Card key={lessonID}>
                <CardHeader>
                  <Badge>{lesson.estimatedMinutes ?? 15} minutes</Badge>
                  <CardTitle>{lesson.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{lesson.summary}</CardDescription>
                  <p className="text-sm text-muted-foreground">
                    Required: {lesson.required ? 'Yes' : 'Optional'}
                  </p>
                </CardContent>
                <CardFooter>
                  <form action={toggleLessonCompletionAction}>
                    <input name="courseSlug" type="hidden" value={course.slug ?? ''} />
                    <input name="lessonID" type="hidden" value={lessonID} />
                    <input name="lessonTitle" type="hidden" value={lesson.title} />
                    <Button
                      size="sm"
                      type="submit"
                      variant={isComplete ? 'secondary' : 'default'}
                    >
                      {isComplete ? 'Mark incomplete' : 'Mark complete'}
                    </Button>
                  </form>
                </CardFooter>
              </Card>
            )
          })}
        </CardGrid>
      </Section>
    </PageShell>
  )
}
