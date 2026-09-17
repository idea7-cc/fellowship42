import { useState, type FormEvent } from 'react'
import {
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import { formatTimestamp } from '@/lib/format'
import type {
  AttendanceStatus,
  Group,
  GroupSession,
  GroupSessionStatus,
  SessionAttendance,
} from '@/lib/api-types'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, FieldGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const sessionStatuses: Array<{ value: GroupSessionStatus; label: string }> = [
  { value: 'planned', label: 'Planned' },
  { value: 'open', label: 'Open' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'cancelled', label: 'Cancelled' },
]

const attendanceStatuses: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
  { value: 'serving', label: 'Serving' },
]

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInputValue(timestamp: number): string {
  const date = new Date(timestamp)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(timestamp - offset).toISOString().slice(0, 16)
}

/**
 * Meeting occurrences for one group, and the register for each.
 *
 * Attendance hangs off sessions in the schema, so there is no way to record
 * who came without first recording that the group met. The register lists the
 * whole roster rather than only marked people, which is what makes "not
 * recorded yet" visibly different from "absent".
 */
export function GroupSessionsPanel({
  churchId,
  group,
  onClose,
}: {
  churchId: string
  group: Group
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const base = `/api/groups/${encodeURIComponent(churchId)}/${encodeURIComponent(group.id)}`
  const sessionQuery = useApiQuery<{ sessions: GroupSession[] }>(
    `${base}/sessions`,
  )
  const sessions = sessionQuery.data?.sessions ?? []

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await sessionQuery.refetch()
      return true
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The session could not be saved.',
      )
      if (caught instanceof ApiError && caught.status === 409) {
        await sessionQuery.refetch()
      }
      return false
    } finally {
      setBusy(false)
    }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const startsAt = new Date(String(form.get('startsAt'))).getTime()
    if (Number.isNaN(startsAt)) return
    const endsRaw = String(form.get('endsAt') ?? '')
    const endsAt = endsRaw ? new Date(endsRaw).getTime() : null
    const location = String(form.get('location') ?? '').trim()
    const saved = await run(() =>
      apiRequest(`${base}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          title: String(form.get('title') ?? ''),
          startsAt,
          endsAt,
          location: location || null,
          status: String(form.get('status') ?? 'planned'),
        }),
      }),
    )
    if (saved) {
      formElement.reset()
      setCreating(false)
    }
  }

  return (
    <Card className="mb-4" elevation="raised">
      <CardHeader className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Sessions — {group.title}</CardTitle>
            <CardDescription>
              {sessionQuery.isLoading
                ? 'Loading sessions…'
                : `${sessions.length} ${sessions.length === 1 ? 'meeting' : 'meetings'} recorded`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              disabled={busy}
              onClick={() => setCreating((open) => !open)}
              size="sm"
            >
              <Plus />
              Add session
            </Button>
            <Button
              aria-label="Close sessions"
              onClick={onClose}
              size="icon-xs"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
        </div>
      </CardHeader>

      {error ? (
        <p
          className="mb-3 rounded-md bg-danger-soft p-2.5 text-sm text-danger-soft-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {creating ? (
        <form
          className="mb-4 grid gap-3 rounded-md border border-border bg-surface-sunken p-3"
          onSubmit={createSession}
        >
          <FieldGrid>
            <Field label="Title" required>
              <Input defaultValue="Weekly gathering" name="title" required />
            </Field>
            <Field label="Status">
              <Select defaultValue="planned" name="status">
                {sessionStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Starts" required>
              <Input
                defaultValue={toLocalInputValue(Date.now())}
                name="startsAt"
                required
                type="datetime-local"
              />
            </Field>
            <Field hint="Optional" label="Ends">
              <Input name="endsAt" type="datetime-local" />
            </Field>
          </FieldGrid>
          <Field hint="Defaults to the group's usual location" label="Location">
            <Input defaultValue={group.location ?? ''} name="location" />
          </Field>
          <div className="flex gap-2">
            <Button disabled={busy} size="sm" type="submit">
              Save session
            </Button>
            <Button
              onClick={() => setCreating(false)}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {sessionQuery.isLoading && !sessionQuery.data ? (
        <div className="grid gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : sessions.length ? (
        <ul className="grid gap-1.5">
          {sessions.map((session) => {
            const open = openSessionId === session.id
            return (
              <li className="rounded-md border border-border" key={session.id}>
                <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
                  <button
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setOpenSessionId(open ? null : session.id)}
                    type="button"
                  >
                    {open ? (
                      <ChevronDown
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    ) : (
                      <ChevronRight
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="truncate text-sm font-medium">
                      {session.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(session.startsAt)}
                    </span>
                  </button>
                  {/* No status badge here: the select beside it already shows
                      the same value and can change it. */}
                  <Select
                    aria-label={`Status for ${session.title}`}
                    containerClassName="w-32"
                    disabled={busy}
                    onChange={(event) =>
                      void run(() =>
                        apiRequest(
                          `${base}/sessions/${encodeURIComponent(session.id)}`,
                          {
                            method: 'PATCH',
                            body: JSON.stringify({
                              status: event.target.value,
                              version: session.version,
                            }),
                          },
                        ),
                      )
                    }
                    selectSize="sm"
                    value={session.status}
                  >
                    {sessionStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    aria-label={`Delete ${session.title}`}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        apiRequest(
                          `${base}/sessions/${encodeURIComponent(session.id)}`,
                          {
                            method: 'DELETE',
                            body: JSON.stringify({ version: session.version }),
                          },
                        ),
                      )
                    }
                    size="icon-xs"
                    variant="destructive-ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>
                {open ? (
                  <SessionRegister base={base} sessionId={session.id} />
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          action={
            <Button onClick={() => setCreating(true)} size="sm">
              <Plus />
              Add session
            </Button>
          }
          description="Record when this group meets, then take attendance against each meeting."
          icon={CalendarDays}
          title="No sessions yet"
        />
      )}
    </Card>
  )
}

/** The register for one session: the whole roster, marked or not. */
function SessionRegister({
  base,
  sessionId,
}: {
  base: string
  sessionId: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const path = `${base}/sessions/${encodeURIComponent(sessionId)}/attendance`
  const attendanceQuery = useApiQuery<SessionAttendance>(path)
  const attendance = attendanceQuery.data

  async function mark(personId: string, status: AttendanceStatus) {
    setBusy(true)
    setError(null)
    try {
      await apiRequest(`${path}/${encodeURIComponent(personId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          version:
            attendance?.entries.find((entry) => entry.personId === personId)
              ?.version ?? 0,
          notes:
            attendance?.entries.find((entry) => entry.personId === personId)
              ?.notes ?? null,
        }),
      })
      await attendanceQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Attendance could not be recorded.',
      )
      await attendanceQuery.refetch()
    } finally {
      setBusy(false)
    }
  }

  /** Taking a register is mostly "everyone came except a few". */
  async function markAllPresent() {
    const unrecorded = (attendance?.entries ?? []).filter(
      (entry) => entry.status === undefined,
    )
    setBusy(true)
    setError(null)
    try {
      for (const entry of unrecorded) {
        await apiRequest(`${path}/${encodeURIComponent(entry.personId)}`, {
          method: 'PUT',
          body: JSON.stringify({
            status: 'present',
            version: entry.version,
            notes: entry.notes ?? null,
          }),
        })
      }
      await attendanceQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Attendance could not be recorded.',
      )
      await attendanceQuery.refetch()
    } finally {
      setBusy(false)
    }
  }

  if (attendanceQuery.isLoading) {
    return (
      <div className="border-t border-border p-3">
        <Skeleton className="h-8" />
      </div>
    )
  }

  if (!attendance?.entries.length) {
    return (
      <div className="border-t border-border p-3">
        <p className="text-sm text-muted-foreground">
          No active members on this group's roster yet, so there is nobody to
          mark.
        </p>
      </div>
    )
  }

  return (
    <div className="border-t border-border bg-surface-sunken/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[0.8125rem] font-medium text-muted-foreground">
          {attendance.presentCount} present · {attendance.recordedCount} of{' '}
          {attendance.entries.length} recorded
        </span>
        <Button
          className="ml-auto"
          disabled={
            busy || attendance.recordedCount === attendance.entries.length
          }
          onClick={() => void markAllPresent()}
          size="xs"
          variant="secondary"
        >
          <CheckCheck />
          Mark rest present
        </Button>
      </div>

      {error ? (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="grid gap-1">
        {attendance.entries.map((entry) => {
          const name = `${entry.firstName} ${entry.lastName}`
          return (
            <li
              className="flex flex-wrap items-center gap-2 rounded-md bg-card px-2.5 py-1.5"
              key={entry.personId}
            >
              <Avatar name={name} size="sm" />
              <span className="text-sm font-medium">{name}</span>
              {entry.status === undefined ? (
                <span className="text-xs text-muted-foreground">
                  Not recorded
                </span>
              ) : null}
              {entry.notes ? (
                <span className="text-xs text-muted-foreground">
                  {entry.notes}
                </span>
              ) : null}
              <Select
                aria-label={`Attendance for ${name}`}
                containerClassName="ml-auto w-32"
                disabled={busy}
                onChange={(event) =>
                  void mark(
                    entry.personId,
                    event.target.value as AttendanceStatus,
                  )
                }
                selectSize="sm"
                value={entry.status ?? ''}
              >
                <option disabled value="">
                  Not recorded
                </option>
                {attendanceStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
