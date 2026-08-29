import { useState, type FormEvent } from 'react'
import { PageShell } from '@/components/page-shell'
import { PageHeader } from '@/components/page-header'
import { Section } from '@/components/section'
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
import { GroupRosterPanel } from '@/components/group-roster-panel'
import { GroupSessionsPanel } from '@/components/group-sessions-panel'
import { controlClass } from '@/components/ui/control'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import { useAuthState } from '@/lib/auth-provider'
import { useChurch } from '@/lib/church-context'
import type { Church, CursorPage, Group } from '@/lib/api-types'

// Selects and textareas in this route share the one control treatment.
const fieldClass = `${controlClass} min-h-9 px-3 py-1.5`
function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

function GroupForm({
  group,
  onCancel,
  onSaved,
}: {
  group: Group | null
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const { churchId } = useChurch()
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
      groupType: String(form.get('groupType') ?? ''),
      audience: String(form.get('audience') ?? ''),
      schedule: String(form.get('schedule') ?? ''),
      location: String(form.get('location') ?? '') || null,
      enrollmentPolicy: String(form.get('enrollmentPolicy') ?? 'closed'),
      capacity: form.get('capacity') ? Number(form.get('capacity')) : null,
      featured: form.get('featured') === 'on',
      summary: String(form.get('summary') ?? ''),
    }
    try {
      await apiRequest(
        group
          ? `/api/groups/${encodeURIComponent(churchId)}/${encodeURIComponent(group.id)}`
          : `/api/groups/${encodeURIComponent(churchId)}`,
        {
          method: group ? 'PATCH' : 'POST',
          body: JSON.stringify(
            group ? { version: group.version, ...value } : value,
          ),
        },
      )
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The group could not be saved.',
      )
      setSaving(false)
    }
  }
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{group ? `Edit ${group.title}` : 'Add a group'}</CardTitle>
        <CardDescription>
          Draft changes stay private until published.
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
                defaultValue={group?.title}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Slug
              <Input
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                defaultValue={group?.slug}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Type
              <Input
                name="groupType"
                required
                maxLength={80}
                defaultValue={group?.groupType}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Audience
              <Input
                name="audience"
                maxLength={160}
                defaultValue={group?.audience}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Schedule
              <Input
                name="schedule"
                maxLength={240}
                defaultValue={group?.schedule}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Location
              <Input
                name="location"
                maxLength={240}
                defaultValue={group?.location}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Status
              <select
                name="status"
                className={fieldClass}
                defaultValue={group?.status ?? 'draft'}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Enrollment
              <select
                name="enrollmentPolicy"
                className={fieldClass}
                defaultValue={group?.enrollmentPolicy ?? 'closed'}
              >
                <option value="closed">Closed</option>
                <option value="request">By request</option>
                <option value="open">Open</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Capacity
              <Input
                name="capacity"
                type="number"
                min={1}
                defaultValue={group?.capacity}
              />
            </label>
            <label className="flex items-center gap-2 self-end py-2 text-sm font-semibold">
              <input
                name="featured"
                type="checkbox"
                defaultChecked={group?.featured}
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
              defaultValue={group?.summary}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save group'}
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

export function GroupsPage() {
  const { churchId } = useChurch()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canWrite = can(permissions, 'groups.write')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const [editor, setEditor] = useState<Group | 'new' | null>(null)
  const [rosterGroup, setRosterGroup] = useState<Group | null>(null)
  const [sessionsGroup, setSessionsGroup] = useState<Group | null>(null)
  const [error, setError] = useState<string | null>(null)
  const publicBase = churchId
    ? `/api/churches/${encodeURIComponent(churchId)}`
    : null
  const churchQuery = useApiQuery<{ church: Church }>(publicBase)
  const params = new URLSearchParams({ limit: '24' })
  if (appliedSearch) params.set('query', appliedSearch)
  if (status) params.set('status', status)
  if (cursors.at(-1)) params.set('cursor', cursors.at(-1)!)
  const groupQuery = useApiQuery<{ groups: Group[]; page?: CursorPage }>(
    churchId
      ? canWrite
        ? `/api/groups/${encodeURIComponent(churchId)}?${params}`
        : `${publicBase}/groups`
      : null,
  )
  async function remove(group: Group) {
    if (!churchId || !window.confirm(`Delete ${group.title}?`)) return
    try {
      await apiRequest(
        `/api/groups/${encodeURIComponent(churchId)}/${encodeURIComponent(group.id)}`,
        { method: 'DELETE', body: JSON.stringify({ version: group.version }) },
      )
      await groupQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The group could not be deleted.',
      )
    }
  }
  const groups = groupQuery.data?.groups ?? []
  const displayedGroups = canWrite
    ? groups
    : groups.filter((group) =>
        [group.title, group.summary, group.groupType]
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
  return (
    <PageShell>
      <PageHeader
        description={
          churchQuery.data?.church
            ? `Ministry groups for ${churchQuery.data.church.name}`
            : 'Groups and teams'
        }
        eyebrow="Groups"
        title="Groups &amp; teams"
      />
      <Section>
        {canWrite ? (
          <form
            role="search"
            className="mb-6 flex flex-wrap gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              setCursors([null])
              setAppliedSearch(search.trim())
            }}
          >
            <Input
              className="max-w-sm"
              placeholder="Search groups"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Publishing status"
              className={fieldClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setCursors([null])
              }}
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
              Add group
            </Button>
          </form>
        ) : (
          <Input
            className="mb-6 max-w-sm"
            placeholder="Search published groups"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {editor ? (
          <GroupForm
            group={editor === 'new' ? null : editor}
            onCancel={() => setEditor(null)}
            onSaved={async () => {
              setEditor(null)
              await groupQuery.refetch()
            }}
          />
        ) : null}
        {rosterGroup && churchId ? (
          <GroupRosterPanel
            churchId={churchId}
            group={rosterGroup}
            onClose={() => setRosterGroup(null)}
          />
        ) : null}
        {sessionsGroup && churchId ? (
          <GroupSessionsPanel
            churchId={churchId}
            group={sessionsGroup}
            onClose={() => setSessionsGroup(null)}
          />
        ) : null}
        {error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {groupQuery.isLoading ? (
          <p>Loading groups…</p>
        ) : displayedGroups.length ? (
          <CardGrid minWidth="280px">
            {displayedGroups.map((group) => (
              <Card key={group.id}>
                <CardHeader>
                  <CardTitle>{group.title}</CardTitle>
                  <CardDescription>{group.summary}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="pill">{group.groupType}</Badge>
                    <Badge variant="outline">{group.status}</Badge>
                    {group.openEnrollment ? (
                      <Badge variant="outline">Open</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {group.location ? `${group.location} · ` : ''}
                    {group.schedule}
                  </p>
                  {canWrite ? (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSessionsGroup(null)
                          setRosterGroup(group)
                        }}
                      >
                        Roster
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setRosterGroup(null)
                          setSessionsGroup(group)
                        }}
                      >
                        Sessions
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditor(group)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void remove(group)}
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
              No groups match this view.
            </CardContent>
          </Card>
        )}
        {canWrite &&
        (cursors.length > 1 || groupQuery.data?.page?.nextCursor) ? (
          <div className="mt-5 flex justify-between">
            <Button
              size="sm"
              variant="outline"
              disabled={cursors.length === 1}
              onClick={() => setCursors((value) => value.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!groupQuery.data?.page?.nextCursor}
              onClick={() =>
                setCursors((value) => [
                  ...value,
                  groupQuery.data!.page!.nextCursor,
                ])
              }
            >
              Next
            </Button>
          </div>
        ) : null}
      </Section>
    </PageShell>
  )
}
