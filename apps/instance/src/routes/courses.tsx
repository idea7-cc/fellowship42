import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
import { CardGrid } from '@/components/card-grid'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import { useAuthState } from '@/lib/auth-provider'
import type { Church, Course, CursorPage } from '@/lib/api-types'

const fieldClass =
  'min-h-10 rounded-lg border border-input bg-card px-3 py-2 text-sm'
function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

function CourseForm({
  course,
  onCancel,
  onSaved,
}: {
  course: Course | null
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const { churchId } = useParams<{ churchId: string }>()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!churchId) return
    setSaving(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const value = {
      slug: String(form.get('slug') ?? ''),
      title: String(form.get('title') ?? ''),
      status: String(form.get('status') ?? 'draft'),
      courseType: String(form.get('courseType') ?? ''),
      deliveryMode: String(form.get('deliveryMode') ?? ''),
      audience: String(form.get('audience') ?? ''),
      duration: String(form.get('duration') ?? ''),
      featured: form.get('featured') === 'on',
      certificateOffered: form.get('certificateOffered') === 'on',
      summary: String(form.get('summary') ?? ''),
    }
    try {
      await apiRequest(
        course
          ? `/api/courses/${encodeURIComponent(churchId)}/${encodeURIComponent(course.id)}`
          : `/api/courses/${encodeURIComponent(churchId)}`,
        {
          method: course ? 'PATCH' : 'POST',
          body: JSON.stringify(
            course ? { version: course.version, ...value } : value,
          ),
        },
      )
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The course could not be saved.',
      )
      setSaving(false)
    }
  }
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          {course ? `Edit ${course.title}` : 'Add a course'}
        </CardTitle>
        <CardDescription>
          Publish when the course and its linked media are ready.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Title
              <Input
                name="title"
                required
                maxLength={160}
                defaultValue={course?.title}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Slug
              <Input
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                defaultValue={course?.slug}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Course type
              <Input
                name="courseType"
                required
                maxLength={80}
                defaultValue={course?.courseType}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Delivery mode
              <Input
                name="deliveryMode"
                required
                maxLength={80}
                defaultValue={course?.deliveryMode}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Audience
              <Input
                name="audience"
                maxLength={160}
                defaultValue={course?.audience}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Duration
              <Input
                name="duration"
                maxLength={120}
                defaultValue={course?.duration}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Status
              <select
                name="status"
                className={fieldClass}
                defaultValue={course?.status ?? 'draft'}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end py-2 text-sm font-semibold">
              <input
                name="featured"
                type="checkbox"
                defaultChecked={course?.featured}
              />{' '}
              Featured
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                name="certificateOffered"
                type="checkbox"
                defaultChecked={course?.certificateOffered}
              />{' '}
              Certificate offered
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            Summary
            <textarea
              name="summary"
              rows={4}
              maxLength={4000}
              className={fieldClass}
              defaultValue={course?.summary}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save course'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function CoursesPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canWrite = can(permissions, 'courses.write')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [editor, setEditor] = useState<Course | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const publicBase = churchId
    ? `/api/churches/${encodeURIComponent(churchId)}`
    : null
  const churchQuery = useApiQuery<{ church: Church }>(publicBase)
  const params = new URLSearchParams({ limit: '100' })
  if (appliedSearch) params.set('query', appliedSearch)
  if (status) params.set('status', status)
  const courseQuery = useApiQuery<{ courses: Course[]; page?: CursorPage }>(
    churchId
      ? canWrite
        ? `/api/courses/${encodeURIComponent(churchId)}?${params}`
        : `${publicBase}/courses`
      : null,
  )
  async function remove(course: Course) {
    if (!churchId || !window.confirm(`Delete ${course.title}?`)) return
    try {
      await apiRequest(
        `/api/courses/${encodeURIComponent(churchId)}/${encodeURIComponent(course.id)}`,
        { method: 'DELETE', body: JSON.stringify({ version: course.version }) },
      )
      await courseQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The course could not be deleted.',
      )
    }
  }
  const courses = courseQuery.data?.courses ?? []
  const displayed = canWrite
    ? courses
    : courses.filter((course) =>
        [course.title, course.summary, course.courseType]
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
  return (
    <PageShell>
      <Section>
        <Eyebrow>Courses</Eyebrow>
        <h1>Courses &amp; studies</h1>
        <p className="mt-2">
          {churchQuery.data?.church
            ? `Learning paths for ${churchQuery.data.church.name}`
            : 'Courses and studies'}
        </p>
      </Section>
      <Section>
        {canWrite ? (
          <form
            role="search"
            className="mb-6 flex flex-wrap gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              setAppliedSearch(search.trim())
            }}
          >
            <Input
              className="max-w-sm"
              placeholder="Search courses"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Publishing status"
              className={fieldClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <Button type="submit" size="sm">
              Search
            </Button>
            <Button type="button" size="sm" onClick={() => setEditor('new')}>
              Add course
            </Button>
          </form>
        ) : (
          <Input
            className="mb-6 max-w-sm"
            placeholder="Search published courses"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {editor ? (
          <CourseForm
            course={editor === 'new' ? null : editor}
            onCancel={() => setEditor(null)}
            onSaved={async () => {
              setEditor(null)
              await courseQuery.refetch()
            }}
          />
        ) : null}
        {error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {courseQuery.isLoading ? (
          <p>Loading courses…</p>
        ) : displayed.length ? (
          <CardGrid minWidth="280px">
            {displayed.map((course) => (
              <Card key={course.id}>
                <CardHeader>
                  <CardTitle>{course.title}</CardTitle>
                  <CardDescription>{course.summary}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="pill">{course.courseType}</Badge>
                    <Badge variant="outline">{course.status}</Badge>
                    <Badge variant="outline">
                      {course.lessonCount} lessons
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/churches/${churchId}/courses/${course.slug}`}>
                        {canWrite ? 'Manage lessons' : 'View course'}
                      </Link>
                    </Button>
                    {canWrite ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditor(course)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void remove(course)}
                        >
                          Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardGrid>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              No courses match this view.
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
