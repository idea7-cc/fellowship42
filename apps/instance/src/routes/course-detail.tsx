import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Hero } from '@/components/hero'
import { Eyebrow } from '@/components/eyebrow'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import { useAuthState } from '@/lib/auth-provider'
import type {
  Church,
  CourseDetailResponse,
  Lesson,
  MediaRecord,
} from '@/lib/api-types'

const fieldClass =
  'min-h-10 rounded-lg border border-input bg-card px-3 py-2 text-sm'
function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

function LessonForm({
  courseId,
  lesson,
  media,
  onCancel,
  onSaved,
}: {
  courseId: string
  lesson: Lesson | null
  media: MediaRecord[]
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
      title: String(form.get('title') ?? ''),
      summary: String(form.get('summary') ?? ''),
      content: String(form.get('content') ?? '') || null,
      mediaId: String(form.get('mediaId') ?? '') || null,
      estimatedMinutes: form.get('estimatedMinutes')
        ? Number(form.get('estimatedMinutes'))
        : null,
      required: form.get('required') === 'on',
      sortOrder: Number(form.get('sortOrder') ?? 0),
    }
    try {
      await apiRequest(
        lesson
          ? `/api/courses/${encodeURIComponent(churchId)}/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lesson.id)}`
          : `/api/courses/${encodeURIComponent(churchId)}/${encodeURIComponent(courseId)}/lessons`,
        {
          method: lesson ? 'PATCH' : 'POST',
          body: JSON.stringify(
            lesson ? { version: lesson.version, ...value } : value,
          ),
        },
      )
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The lesson could not be saved.',
      )
      setSaving(false)
    }
  }
  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle>
          {lesson ? `Edit ${lesson.title}` : 'Add a lesson'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Title
              <Input
                name="title"
                required
                maxLength={200}
                defaultValue={lesson?.title}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Order
              <Input
                name="sortOrder"
                type="number"
                required
                min={0}
                max={10000}
                defaultValue={lesson?.sortOrder ?? 0}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Minutes
              <Input
                name="estimatedMinutes"
                type="number"
                min={1}
                defaultValue={lesson?.estimatedMinutes}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Public media
              <select
                name="mediaId"
                className={fieldClass}
                defaultValue={lesson?.mediaId ?? ''}
              >
                <option value="">No media</option>
                {media
                  .filter((item) => item.visibility === 'public')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.altText || item.id} · {item.contentType}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                name="required"
                type="checkbox"
                defaultChecked={lesson?.required ?? true}
              />{' '}
              Required lesson
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            Summary
            <textarea
              name="summary"
              rows={2}
              maxLength={4000}
              className={fieldClass}
              defaultValue={lesson?.summary}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Lesson content
            <textarea
              name="content"
              rows={8}
              maxLength={100000}
              className={fieldClass}
              defaultValue={lesson?.content}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button size="sm" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save lesson'}
            </Button>
            <Button
              size="sm"
              type="button"
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

export function CourseDetailPage() {
  const { churchId, slug } = useParams<{ churchId: string; slug: string }>()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canWrite = can(permissions, 'courses.write')
  const [editor, setEditor] = useState<Lesson | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const publicBase = churchId
    ? `/api/churches/${encodeURIComponent(churchId)}`
    : null
  const churchQuery = useApiQuery<{ church: Church }>(publicBase)
  const courseQuery = useApiQuery<CourseDetailResponse>(
    churchId && slug
      ? canWrite
        ? `/api/courses/${encodeURIComponent(churchId)}/${encodeURIComponent(slug)}`
        : `${publicBase}/courses/${encodeURIComponent(slug)}`
      : null,
  )
  const mediaQuery = useApiQuery<{ media: MediaRecord[] }>(
    churchId && canWrite
      ? `/api/media/${encodeURIComponent(churchId)}?limit=100`
      : null,
  )
  const course = courseQuery.data?.course
  const lessons = courseQuery.data?.lessons ?? []
  async function remove(lesson: Lesson) {
    if (!churchId || !course || !window.confirm(`Delete ${lesson.title}?`))
      return
    try {
      await apiRequest(
        `/api/courses/${encodeURIComponent(churchId)}/${encodeURIComponent(course.id)}/lessons/${encodeURIComponent(lesson.id)}`,
        { method: 'DELETE', body: JSON.stringify({ version: lesson.version }) },
      )
      await courseQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The lesson could not be deleted.',
      )
    }
  }
  return (
    <PageShell>
      {courseQuery.isLoading ? (
        <Section>
          <p>Loading course…</p>
        </Section>
      ) : !course ? (
        <Section>
          <Card>
            <CardHeader>
              <CardTitle>Course not found</CardTitle>
              <CardDescription>
                The course is unavailable or not published.
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
            <div className="mt-4 flex flex-wrap gap-3">
              <Badge variant="pill">{course.courseType}</Badge>
              <Badge variant="outline">{course.status}</Badge>
              <span className="text-sm text-muted-foreground">
                {lessons.length} lessons
                {churchQuery.data?.church
                  ? ` for ${churchQuery.data.church.name}`
                  : ''}
              </span>
            </div>
          </Hero>
          <Section
            title="Lessons"
            description={
              canWrite
                ? 'Create and order public course material.'
                : 'Course content and materials.'
            }
          >
            {canWrite ? (
              <div className="mb-5">
                <Button size="sm" onClick={() => setEditor('new')}>
                  Add lesson
                </Button>
              </div>
            ) : null}
            {editor && course ? (
              <LessonForm
                courseId={course.id}
                lesson={editor === 'new' ? null : editor}
                media={mediaQuery.data?.media ?? []}
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
            {lessons.length ? (
              <div className="grid gap-3">
                {lessons.map((lesson, index) => (
                  <Card key={lesson.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle>
                            {index + 1}. {lesson.title}
                          </CardTitle>
                          <CardDescription>{lesson.summary}</CardDescription>
                        </div>
                        {lesson.estimatedMinutes ? (
                          <Badge variant="outline">
                            {lesson.estimatedMinutes} min
                          </Badge>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {lesson.content ? (
                        <p className="whitespace-pre-wrap text-sm leading-6">
                          {lesson.content}
                        </p>
                      ) : null}
                      {lesson.mediaId ? (
                        <a
                          className="mt-3 block text-sm font-semibold text-accent-strong underline"
                          href={`/media/${encodeURIComponent(lesson.mediaId)}`}
                        >
                          Open lesson media
                        </a>
                      ) : null}
                      {canWrite ? (
                        <div className="mt-4 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditor(lesson)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void remove(lesson)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center text-muted-foreground">
                  This course has no lessons yet.
                </CardContent>
              </Card>
            )}
          </Section>
        </>
      )}
    </PageShell>
  )
}
