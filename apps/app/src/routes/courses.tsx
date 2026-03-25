import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@convex/_generated/api'

import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { asId } from '@/lib/convex'

export function CoursesPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const [search, setSearch] = useState('')
  const churchArgs = churchId ? { churchId: asId<'churches'>(churchId) } : 'skip'
  const church = useQuery(api.churches.getPublishedById, churchArgs)
  const courses = useQuery(api.courses.listByChurch, churchArgs)
  const filteredCourses =
    courses?.filter((course) => {
      const query = search.trim().toLowerCase()
      if (!query) {
        return true
      }

      return [course.title, course.summary, course.courseType, course.deliveryMode, course.audience]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    }) ?? []

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
        <p className="mt-2">
          {church ? `Published courses for ${church.name}` : 'Published courses and studies'}
        </p>
      </Section>

      <Section>
        {courses === undefined ? (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">Loading courses...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search courses..."
                className="max-w-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button size="sm" disabled>
                Course creation requires auth
              </Button>
            </div>

        {filteredCourses.length > 0 ? (
          <CardGrid minWidth="280px">
            {filteredCourses.map((course) => (
              <Link key={course._id} to={`/churches/${churchId}/courses/${course.slug}`}>
                <Card className="h-full transition-all duration-200 hover:-translate-y-px hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{course.title}</CardTitle>
                    {course.summary && (
                      <CardDescription>{course.summary}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="pill">{course.courseType}</Badge>
                      <Badge variant="outline">{course.deliveryMode}</Badge>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <span className="text-sm text-muted-foreground">
                      {course.lessons.length} lessons
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </CardGrid>
        ) : (
          <Card className="flex flex-col items-center justify-center border-dashed p-8">
            <CardContent>
              <p className="text-center text-muted-foreground">
                {courses.length > 0
                  ? 'No courses match your current search.'
                  : 'No published courses are available for this church yet.'}
              </p>
            </CardContent>
          </Card>
        )}
          </>
        )}
      </Section>
    </PageShell>
  )
}
