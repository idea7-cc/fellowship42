import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
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
import type { Church, CursorPage, EventRecord } from '@/lib/api-types'
import { formatTimestamp } from '@/lib/format'

const fieldClass =
  'min-h-10 rounded-lg border border-input bg-card px-3 py-2 text-sm'
function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}
function localDateTime(value?: number) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(value - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function EventForm({
  event,
  timezone,
  onCancel,
  onSaved,
}: {
  event: EventRecord | null
  timezone: string
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const { churchId } = useParams<{ churchId: string }>()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!churchId) return
    setSaving(true)
    setError(null)
    const form = new FormData(formEvent.currentTarget)
    const value = {
      slug: String(form.get('slug') ?? ''),
      title: String(form.get('title') ?? ''),
      status: String(form.get('status') ?? 'draft'),
      summary: String(form.get('summary') ?? ''),
      startsAt: new Date(String(form.get('startsAt'))).getTime(),
      endsAt: form.get('endsAt')
        ? new Date(String(form.get('endsAt'))).getTime()
        : null,
      timezone: String(form.get('timezone') ?? timezone),
      location: String(form.get('location') ?? ''),
      registrationUrl: String(form.get('registrationUrl') ?? '') || null,
      capacity: form.get('capacity') ? Number(form.get('capacity')) : null,
      featured: form.get('featured') === 'on',
    }
    try {
      await apiRequest(
        event
          ? `/api/events/${encodeURIComponent(churchId)}/${encodeURIComponent(event.id)}`
          : `/api/events/${encodeURIComponent(churchId)}`,
        {
          method: event ? 'PATCH' : 'POST',
          body: JSON.stringify(
            event ? { version: event.version, ...value } : value,
          ),
        },
      )
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The event could not be saved.',
      )
      setSaving(false)
    }
  }
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{event ? `Edit ${event.title}` : 'Add an event'}</CardTitle>
        <CardDescription>
          Only published events appear on the public church schedule.
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
                maxLength={200}
                defaultValue={event?.title}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Slug
              <Input
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                defaultValue={event?.slug}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Starts
              <Input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={localDateTime(event?.startDate)}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Ends
              <Input
                name="endsAt"
                type="datetime-local"
                defaultValue={localDateTime(event?.endDate)}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Timezone
              <Input
                name="timezone"
                required
                maxLength={64}
                defaultValue={event?.timezone ?? timezone}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Location
              <Input
                name="location"
                maxLength={240}
                defaultValue={event?.location}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Registration URL
              <Input
                name="registrationUrl"
                type="url"
                defaultValue={event?.registrationUrl}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Capacity
              <Input
                name="capacity"
                type="number"
                min={1}
                defaultValue={event?.capacity}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Status
              <select
                name="status"
                className={fieldClass}
                defaultValue={event?.status ?? 'draft'}
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
                defaultChecked={event?.featured}
              />{' '}
              Featured
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            Summary
            <textarea
              name="summary"
              rows={4}
              maxLength={4000}
              className={fieldClass}
              defaultValue={event?.summary}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button size="sm" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save event'}
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

export function EventsPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canWrite = can(permissions, 'events.write')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [editor, setEditor] = useState<EventRecord | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const publicBase = churchId
    ? `/api/churches/${encodeURIComponent(churchId)}`
    : null
  const churchQuery = useApiQuery<{ church: Church }>(publicBase)
  const params = new URLSearchParams({ limit: '100' })
  if (appliedSearch) params.set('query', appliedSearch)
  if (status) params.set('status', status)
  const eventQuery = useApiQuery<{ events: EventRecord[]; page?: CursorPage }>(
    churchId
      ? canWrite
        ? `/api/events/${encodeURIComponent(churchId)}?${params}`
        : `${publicBase}/events`
      : null,
  )
  async function remove(event: EventRecord) {
    if (!churchId || !window.confirm(`Delete ${event.title}?`)) return
    try {
      await apiRequest(
        `/api/events/${encodeURIComponent(churchId)}/${encodeURIComponent(event.id)}`,
        { method: 'DELETE', body: JSON.stringify({ version: event.version }) },
      )
      await eventQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The event could not be deleted.',
      )
    }
  }
  const events = eventQuery.data?.events ?? []
  const displayed = canWrite
    ? events
    : events.filter((event) =>
        [event.title, event.summary, event.location]
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
  return (
    <PageShell>
      <Section>
        <Eyebrow>Events</Eyebrow>
        <h1>Events &amp; services</h1>
        <p className="mt-2">
          {churchQuery.data?.church
            ? `Schedule for ${churchQuery.data.church.name}`
            : 'Upcoming events and services'}
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
              placeholder="Search events"
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
            <Button size="sm" type="submit">
              Search
            </Button>
            <Button size="sm" type="button" onClick={() => setEditor('new')}>
              Add event
            </Button>
          </form>
        ) : (
          <Input
            className="mb-6 max-w-sm"
            placeholder="Search events"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {editor ? (
          <EventForm
            event={editor === 'new' ? null : editor}
            timezone={churchQuery.data?.church.timezone ?? 'America/New_York'}
            onCancel={() => setEditor(null)}
            onSaved={async () => {
              setEditor(null)
              await eventQuery.refetch()
            }}
          />
        ) : null}
        {error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {eventQuery.isLoading ? (
          <p>Loading events…</p>
        ) : displayed.length ? (
          <CardGrid minWidth="280px">
            {displayed.map((event) => (
              <Card key={event.id}>
                <CardHeader>
                  <CardTitle>{event.title}</CardTitle>
                  <CardDescription>
                    {formatTimestamp(event.startDate)} · {event.timezone}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{event.status}</Badge>
                    {event.featured ? (
                      <Badge variant="pill">Featured</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm">{event.summary}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {event.location}
                  </p>
                  {event.registrationUrl ? (
                    <a
                      className="mt-2 block text-sm font-semibold text-accent-strong underline"
                      href={event.registrationUrl}
                    >
                      Register
                    </a>
                  ) : null}
                  {canWrite ? (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditor(event)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void remove(event)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </CardGrid>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              No events match this view.
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
