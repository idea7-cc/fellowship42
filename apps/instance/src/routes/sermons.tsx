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
import type { Church, CursorPage, MediaRecord, Sermon } from '@/lib/api-types'
import { formatTimestamp } from '@/lib/format'

const fieldClass =
  'min-h-10 rounded-lg border border-input bg-card px-3 py-2 text-sm'
function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}
function localDate(value?: number) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

function SermonForm({
  sermon,
  media,
  onCancel,
  onSaved,
}: {
  sermon: Sermon | null
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
      slug: String(form.get('slug') ?? ''),
      title: String(form.get('title') ?? ''),
      status: String(form.get('status') ?? 'draft'),
      speaker: String(form.get('speaker') ?? ''),
      series: String(form.get('series') ?? '') || null,
      summary: String(form.get('summary') ?? ''),
      videoUrl: String(form.get('videoUrl') ?? '') || null,
      audioMediaId: String(form.get('audioMediaId') ?? '') || null,
      preachedAt: new Date(
        `${String(form.get('preachedAt'))}T12:00:00`,
      ).getTime(),
      featured: form.get('featured') === 'on',
    }
    try {
      await apiRequest(
        sermon
          ? `/api/sermons/${encodeURIComponent(churchId)}/${encodeURIComponent(sermon.id)}`
          : `/api/sermons/${encodeURIComponent(churchId)}`,
        {
          method: sermon ? 'PATCH' : 'POST',
          body: JSON.stringify(
            sermon ? { version: sermon.version, ...value } : value,
          ),
        },
      )
      await onSaved()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The sermon could not be saved.',
      )
      setSaving(false)
    }
  }
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          {sermon ? `Edit ${sermon.title}` : 'Add a sermon'}
        </CardTitle>
        <CardDescription>
          Public sermons may reference only public audio in this church.
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
                defaultValue={sermon?.title}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Slug
              <Input
                name="slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                defaultValue={sermon?.slug}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Speaker
              <Input
                name="speaker"
                required
                maxLength={160}
                defaultValue={sermon?.speaker}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Series
              <Input
                name="series"
                maxLength={160}
                defaultValue={sermon?.series}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Preached date
              <Input
                name="preachedAt"
                type="date"
                required
                defaultValue={localDate(sermon?.preachedAt)}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Video URL
              <Input
                name="videoUrl"
                type="url"
                defaultValue={sermon?.videoUrl}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Public audio
              <select
                name="audioMediaId"
                className={fieldClass}
                defaultValue={sermon?.audioMediaId ?? ''}
              >
                <option value="">No audio</option>
                {media
                  .filter(
                    (item) =>
                      item.visibility === 'public' &&
                      item.mediaType === 'audio',
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.altText || item.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Status
              <select
                name="status"
                className={fieldClass}
                defaultValue={sermon?.status ?? 'draft'}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                name="featured"
                type="checkbox"
                defaultChecked={sermon?.featured}
              />{' '}
              Featured
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            Summary
            <textarea
              name="summary"
              rows={5}
              maxLength={10000}
              className={fieldClass}
              defaultValue={sermon?.summary}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3">
            <Button size="sm" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save sermon'}
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

export function SermonsPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canWrite = can(permissions, 'sermons.write')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [editor, setEditor] = useState<Sermon | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const publicBase = churchId
    ? `/api/churches/${encodeURIComponent(churchId)}`
    : null
  const churchQuery = useApiQuery<{ church: Church }>(publicBase)
  const params = new URLSearchParams({ limit: '100' })
  if (appliedSearch) params.set('query', appliedSearch)
  if (status) params.set('status', status)
  const sermonQuery = useApiQuery<{ sermons: Sermon[]; page?: CursorPage }>(
    churchId
      ? canWrite
        ? `/api/sermons/${encodeURIComponent(churchId)}?${params}`
        : `${publicBase}/sermons`
      : null,
  )
  const mediaQuery = useApiQuery<{ media: MediaRecord[] }>(
    churchId && canWrite
      ? `/api/media/${encodeURIComponent(churchId)}?limit=100`
      : null,
  )
  async function remove(sermon: Sermon) {
    if (!churchId || !window.confirm(`Delete ${sermon.title}?`)) return
    try {
      await apiRequest(
        `/api/sermons/${encodeURIComponent(churchId)}/${encodeURIComponent(sermon.id)}`,
        { method: 'DELETE', body: JSON.stringify({ version: sermon.version }) },
      )
      await sermonQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The sermon could not be deleted.',
      )
    }
  }
  const sermons = sermonQuery.data?.sermons ?? []
  const displayed = canWrite
    ? sermons
    : sermons.filter((sermon) =>
        [sermon.title, sermon.speaker, sermon.series, sermon.summary]
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
  return (
    <PageShell>
      <Section>
        <Eyebrow>Sermons</Eyebrow>
        <h1>Messages &amp; media</h1>
        <p className="mt-2">
          {churchQuery.data?.church
            ? `Published teaching from ${churchQuery.data.church.name}`
            : 'Sermons and messages'}
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
              placeholder="Search sermons"
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
              Add sermon
            </Button>
          </form>
        ) : (
          <Input
            className="mb-6 max-w-sm"
            placeholder="Search sermons"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {editor ? (
          <SermonForm
            sermon={editor === 'new' ? null : editor}
            media={mediaQuery.data?.media ?? []}
            onCancel={() => setEditor(null)}
            onSaved={async () => {
              setEditor(null)
              await sermonQuery.refetch()
            }}
          />
        ) : null}
        {error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {sermonQuery.isLoading ? (
          <p>Loading sermons…</p>
        ) : displayed.length ? (
          <CardGrid minWidth="300px">
            {displayed.map((sermon) => (
              <Card key={sermon.id}>
                <CardHeader>
                  <CardTitle>{sermon.title}</CardTitle>
                  <CardDescription>
                    {sermon.speaker} · {formatTimestamp(sermon.preachedAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{sermon.status}</Badge>
                    {sermon.series ? (
                      <Badge variant="pill">{sermon.series}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm">{sermon.summary}</p>
                  {sermon.audioMediaId ? (
                    <audio
                      className="mt-4 w-full"
                      controls
                      preload="none"
                      src={`/media/${encodeURIComponent(sermon.audioMediaId)}`}
                    />
                  ) : null}
                  {sermon.videoUrl ? (
                    <a
                      className="mt-3 block text-sm font-semibold text-accent-strong underline"
                      href={sermon.videoUrl}
                    >
                      Watch video
                    </a>
                  ) : null}
                  {canWrite ? (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditor(sermon)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void remove(sermon)}
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
              No sermons match this view.
            </CardContent>
          </Card>
        )}
      </Section>
    </PageShell>
  )
}
