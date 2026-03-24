import { Link, useParams } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Hero } from '@/components/hero'
import { Eyebrow } from '@/components/eyebrow'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export function CourseDetailPage() {
  const { churchId, slug } = useParams<{ churchId: string; slug: string }>()

  // TODO: Replace with useQuery(api.courses.getBySlug, { churchId, slug }) once Convex is connected
  const course = {
    _id: slug,
    title: 'Course Title',
    slug,
    description: 'Course description will appear here once connected to Convex.',
    status: 'draft',
  }

  // TODO: Replace with useQuery(api.lessons.list, { courseId: course._id }) once Convex is connected
  const lessons: { _id: string; title: string; order: number; duration?: string }[] = []

  return (
    <PageShell>
      <Section>
        <Link to={`/churches/${churchId}/courses`}>
          <Button variant="ghost" size="sm">
            Back to courses
          </Button>
        </Link>
      </Section>

      <Hero variant="landing">
        <Eyebrow>Course</Eyebrow>
        <h1>{course.title}</h1>
        <p className="mt-2">{course.description}</p>
        <div className="mt-4 flex items-center gap-3">
          <Badge variant="pill">{course.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {lessons.length} lessons
          </span>
        </div>
      </Hero>

      <Section title="Lessons" description="Course content and materials.">
        {lessons.length > 0 ? (
          <div className="grid gap-3">
            {lessons.map((lesson, index) => (
              <div key={lesson._id}>
                <Card className="hover:-translate-y-px hover:shadow-md transition-all duration-200">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-accent-strong">
                          {lesson.order}
                        </span>
                        <CardTitle>{lesson.title}</CardTitle>
                      </div>
                      {lesson.duration && (
                        <CardDescription>{lesson.duration}</CardDescription>
                      )}
                    </div>
                  </CardHeader>
                </Card>
                {index < lessons.length - 1 && <Separator className="my-1" />}
              </div>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center p-8 border-dashed">
            <CardContent>
              <p className="text-center text-muted-foreground">
                No lessons yet. Add lessons to build out this course.
              </p>
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm">
                  Add first lesson
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
