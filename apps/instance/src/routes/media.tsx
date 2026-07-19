import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { Eyebrow } from '@/components/eyebrow'
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
import type { CursorPage, MediaRecord } from '@/lib/api-types'

function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

export function MediaPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canWrite = can(permissions, 'media.write')
  const mediaQuery = useApiQuery<{ media: MediaRecord[]; page: CursorPage }>(
    churchId && canWrite
      ? `/api/media/${encodeURIComponent(churchId)}?limit=100`
      : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!churchId) return
    const form = new FormData(event.currentTarget)
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return
    setUploading(true)
    setError(null)
    const query = new URLSearchParams({
      visibility: String(form.get('visibility') ?? 'private'),
      altText: String(form.get('altText') ?? ''),
    })
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(churchId)}?${query}`,
        {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        },
      )
      if (!response.ok) {
        const body = await response
          .json<{ error?: { message?: string } }>()
          .catch((): { error?: { message?: string } } => ({}))
        throw new Error(
          body.error?.message ?? `Upload failed with status ${response.status}`,
        )
      }
      event.currentTarget.reset()
      await mediaQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The media could not be uploaded.',
      )
    } finally {
      setUploading(false)
    }
  }

  async function toggleVisibility(media: MediaRecord) {
    if (!churchId) return
    setError(null)
    try {
      await apiRequest(
        `/api/media/${encodeURIComponent(churchId)}/${encodeURIComponent(media.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            version: media.version,
            visibility: media.visibility === 'public' ? 'private' : 'public',
          }),
        },
      )
      await mediaQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Media visibility could not be changed.',
      )
    }
  }

  async function remove(media: MediaRecord) {
    if (!churchId || !window.confirm('Delete this media object?')) return
    setError(null)
    try {
      await apiRequest(
        `/api/media/${encodeURIComponent(churchId)}/${encodeURIComponent(media.id)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ version: media.version }),
        },
      )
      await mediaQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The media could not be deleted.',
      )
    }
  }

  return (
    <PageShell>
      <Section>
        <Eyebrow>Publishing</Eyebrow>
        <h1>Media library</h1>
        <p className="mt-2">
          Church-owned R2 objects with D1 authorization metadata and checksums.
        </p>
      </Section>
      <Section>
        {!canWrite ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              Media management permission is required.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Upload media</CardTitle>
                <CardDescription>
                  Images, audio, video, and PDF files up to 20 MiB. Public
                  visibility is disclosure; never use it for sensitive files.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={upload}>
                  <Input
                    name="file"
                    type="file"
                    required
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif,audio/*,video/mp4,video/webm,video/ogg,application/pdf"
                  />
                  <Input
                    name="altText"
                    maxLength={500}
                    placeholder="Alternative text or a short media description"
                  />
                  <label className="grid gap-1 text-sm font-semibold">
                    Visibility
                    <select
                      name="visibility"
                      defaultValue="private"
                      className="min-h-10 rounded-lg border border-input bg-card px-3"
                    >
                      <option value="private">Private draft</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                  {error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" size="sm" disabled={uploading}>
                    {uploading ? 'Uploading…' : 'Upload'}
                  </Button>
                </form>
              </CardContent>
            </Card>
            {mediaQuery.isLoading ? (
              <p>Loading media…</p>
            ) : (
              <div className="grid gap-4">
                {(mediaQuery.data?.media ?? []).map((media) => (
                  <Card key={media.id}>
                    <CardHeader>
                      <CardTitle>{media.altText || media.id}</CardTitle>
                      <CardDescription>
                        {media.contentType} · {media.byteSize.toLocaleString()}{' '}
                        bytes
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-3">
                      <Badge
                        variant={
                          media.visibility === 'public' ? 'pill' : 'outline'
                        }
                      >
                        {media.visibility}
                      </Badge>
                      {media.url ? (
                        <a
                          className="text-sm font-semibold text-accent-strong underline"
                          href={media.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleVisibility(media)}
                      >
                        Make{' '}
                        {media.visibility === 'public' ? 'private' : 'public'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void remove(media)}
                      >
                        Delete
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                {!mediaQuery.data?.media.length ? (
                  <Card className="border-dashed">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No media uploaded yet.
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}
          </>
        )}
      </Section>
    </PageShell>
  )
}
