import { Link, useParams } from 'react-router-dom'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function CoursesPage() {
  const { churchId } = useParams<{ churchId: string }>()

  // TODO: Replace with useQuery(api.courses.list, { churchId }) once Convex is connected
  const courses: { _id: string; title: string; slug: string; description?: string; lessonCount?: number; status?: string }[] = []

  return (
    <PageShell>
      <Section>
        <Link to={`/churches/${churchId}`}>
          <Button variant="ghost" size="sm">
            Back to church
          </Button>
        </Link>
      </Section>

      <Section>
        <Eyebrow>Courses</Eyebrow>
        <h1>Courses &amp; studies</h1>
        <p className="mt-2">Classes, Bible studies, and training programs</p>
      </Section>

      <Section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Input placeholder="Search courses..." className="max-w-sm" />
          <Button size="sm">Create course</Button>
        </div>

        {courses.length > 0 ? (
          <CardGrid minWidth="280px">
            {courses.map((course) => (
              <Link key={course._id} to={`/churches/${churchId}/courses/${course.slug}`}>
                <Card className="hover:-translate-y-px hover:shadow-md transition-all duration-200 h-full">
                  <CardHeader>
                    <CardTitle>{course.title}</CardTitle>
                    {course.description && (
                      <CardDescription>{course.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    {course.status && <Badge variant="pill">{course.status}</Badge>}
                  </CardContent>
                  <CardFooter>
                    <span className="text-sm text-muted-foreground">
                      {course.lessonCount ?? 0} lessons
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center p-8 border-dashed">
            <CardContent>
              <p className="text-center text-muted-foreground">
                No courses yet. Create classes, studies, or training programs.
              </p>
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm">
                  Create your first course
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
