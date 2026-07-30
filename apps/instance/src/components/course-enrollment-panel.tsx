import { useState, type FormEvent } from 'react'
import { Plus, UserMinus, Users, UsersRound } from 'lucide-react'

import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import type {
  CourseEnrollment,
  CourseEnrollmentStatus,
  Group,
  Person,
} from '@/lib/api-types'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tab, Tabs } from '@/components/ui/tabs'

const enrollmentStatuses: Array<{ value: CourseEnrollmentStatus; label: string }> = [
  { value: 'invited', label: 'Invited' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

/**
 * Enrollment management for one course.
 *
 * An enrollment names either a person or a whole group — enrolling an existing
 * small group is how most churches actually run a study, and the schema
 * enforces the either/or with a CHECK constraint.
 */
export function CourseEnrollmentPanel({
  churchId,
  courseId,
  courseTitle,
}: {
  churchId: string
  courseId: string
  courseTitle: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [subject, setSubject] = useState<'person' | 'group'>('person')

  const base = `/api/courses/${encodeURIComponent(churchId)}/${encodeURIComponent(courseId)}`
  const enrollmentQuery = useApiQuery<{ enrollments: CourseEnrollment[] }>(
    `${base}/enrollments`,
  )
  const peopleQuery = useApiQuery<{ people: Person[] }>(
    `/api/people/${encodeURIComponent(churchId)}?limit=100`,
  )
  const groupQuery = useApiQuery<{ groups: Group[] }>(
    `/api/groups/${encodeURIComponent(churchId)}?limit=100`,
  )

  const enrollments = enrollmentQuery.data?.enrollments ?? []
  const activeCount = enrollments.filter((entry) => entry.status === 'active').length

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await enrollmentQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The enrollment could not be updated.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const subjectId = String(form.get('subjectId') ?? '')
    if (!subjectId) return
    const status = String(form.get('status') ?? 'invited')
    event.currentTarget.reset()
    await run(() =>
      apiRequest(`${base}/enrollments`, {
        method: 'POST',
        body: JSON.stringify(
          subject === 'person'
            ? { personId: subjectId, status }
            : { groupId: subjectId, status },
        ),
      }),
    )
  }

  return (
    <Card elevation="raised">
      <CardHeader className="mb-4">
        <CardTitle>Enrollment</CardTitle>
        <CardDescription>
          {enrollmentQuery.isLoading
            ? 'Loading enrollment…'
            : `${enrollments.length} enrolled · ${activeCount} active in ${courseTitle}`}
        </CardDescription>
      </CardHeader>

      {error ? (
        <p
          className="mb-3 rounded-md bg-danger-soft p-2.5 text-sm text-danger-soft-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {enrollmentQuery.isLoading ? (
        <div className="grid gap-2">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : (
        <div className="grid gap-4">
          {enrollments.length ? (
            <ul className="grid gap-1.5">
              {enrollments.map((entry) => (
                <li
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
                  key={entry.id}
                >
                  {entry.groupId ? (
                    <UsersRound aria-hidden className="size-4 text-muted-foreground" />
                  ) : (
                    <Users aria-hidden className="size-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{entry.subjectName}</span>
                  <StatusBadge size="sm" status={entry.status} />
                  <div className="ml-auto flex items-center gap-1.5">
                    <label className="sr-only" htmlFor={`enrollment-${entry.id}`}>
                      Status for {entry.subjectName}
                    </label>
                    <Select
                      containerClassName="w-36"
                      disabled={busy}
                      id={`enrollment-${entry.id}`}
                      onChange={(event) =>
                        void run(() =>
                          apiRequest(`${base}/enrollments/${encodeURIComponent(entry.id)}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: event.target.value }),
                          }),
                        )
                      }
                      selectSize="sm"
                      value={entry.status}
                    >
                      {enrollmentStatuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </Select>
                    <Button
                      aria-label={`Remove ${entry.subjectName}`}
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          apiRequest(`${base}/enrollments/${encodeURIComponent(entry.id)}`, {
                            method: 'DELETE',
                          }),
                        )
                      }
                      size="icon-xs"
                      variant="destructive-ghost"
                    >
                      <UserMinus />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="py-8"
              description="Enroll a person or a whole group to start this course."
              icon={Users}
              title="Nobody enrolled yet"
            />
          )}

          <div className="border-t border-border pt-4">
            <Tabs
              className="mb-3"
              label="Enroll a person or a group"
              onValueChange={(next) => setSubject(next as 'person' | 'group')}
              value={subject}
            >
              <Tab value="person">Person</Tab>
              <Tab value="group">Group</Tab>
            </Tabs>
            <form className="flex flex-wrap items-end gap-2" onSubmit={enroll}>
              <Field
                className="min-w-48 flex-1"
                label={subject === 'person' ? 'Person' : 'Group'}
              >
                {/* Remount on tab change so the previous selection cannot be submitted. */}
                <Select defaultValue="" key={subject} name="subjectId" required selectSize="sm">
                  <option disabled value="">
                    {subject === 'person' ? 'Select a person' : 'Select a group'}
                  </option>
                  {subject === 'person'
                    ? (peopleQuery.data?.people ?? []).map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.firstName} {person.lastName}
                        </option>
                      ))
                    : (groupQuery.data?.groups ?? []).map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.title}
                        </option>
                      ))}
                </Select>
              </Field>
              <Field className="w-36" label="Status">
                <Select defaultValue="invited" name="status" selectSize="sm">
                  {enrollmentStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button disabled={busy} size="sm" type="submit">
                <Plus />
                Enroll
              </Button>
            </form>
          </div>
        </div>
      )}
    </Card>
  )
}
