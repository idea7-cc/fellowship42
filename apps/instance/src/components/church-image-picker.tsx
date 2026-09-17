import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Upload, X } from 'lucide-react'
import type { MediaRecord } from '@/lib/api-types'
import { useApiQuery } from '@/lib/api'
import { Button } from './ui/button'

export function ChurchImagePicker({
  churchId,
  label,
  value,
  onChange,
  disabled,
}: {
  churchId: string
  label: string
  value: string | null
  onChange: (id: string | null) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<Array<string | null>>([null])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const active = useRef(false)
  const base = `/api/church-settings/${encodeURIComponent(churchId)}/images`
  const cursor = pages.at(-1)
  const query = useApiQuery<{
    images: Array<{ id: string; altText: string }>
    nextCursor: string | null
  }>(
    open
      ? `${base}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
      : null,
  )
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  function close() {
    setOpen(false)
    trigger.current?.focus()
  }
  function choose(id: string | null) {
    onChange(id)
    close()
  }
  async function upload(file: File | undefined) {
    if (!file) return
    if (
      ![
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'image/avif',
      ].includes(file.type) ||
      file.size === 0 ||
      file.size > 20 * 1024 * 1024
    ) {
      setError('Choose a PNG, JPG, WebP, GIF, or AVIF image under 20 MB.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(churchId)}?visibility=private&altText=${encodeURIComponent(label)}`,
        { method: 'POST', headers: { 'Content-Type': file.type }, body: file },
      )
      if (!response.ok) throw new Error('Image upload failed. Try again.')
      const result = (await response.json()) as { media: MediaRecord }
      if (active.current) choose(result.media.id)
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error ? reason.message : 'Image upload failed.',
        )
    } finally {
      if (active.current) setBusy(false)
    }
  }
  return (
    <div>
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <button
        ref={trigger}
        disabled={disabled}
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        aria-label={`Choose ${label.toLowerCase()}`}
        className="flex aspect-[2/1] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-input bg-surface-sunken hover:border-primary disabled:opacity-50"
      >
        {value ? (
          <img
            className="h-full w-full object-contain"
            alt={label}
            src={`${base}/${encodeURIComponent(value)}`}
          />
        ) : (
          <ImagePlus aria-hidden className="size-6 text-muted-foreground" />
        )}
      </button>
      {value && (
        <Button
          disabled={disabled}
          className="mt-1"
          size="xs"
          variant="ghost"
          onClick={() => onChange(null)}
        >
          <X aria-hidden />
          Remove {label.toLowerCase()}
        </Button>
      )}
      <dialog
        ref={dialog}
        aria-label={`Choose ${label.toLowerCase()}`}
        onCancel={(event) => {
          event.preventDefault()
          if (!busy) close()
        }}
        className="m-auto max-h-[85vh] w-11/12 max-w-xl overflow-auto rounded-xl border border-border bg-background p-5 text-foreground shadow-xl backdrop:bg-foreground/30"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg">{label}</h2>
          <Button
            aria-label="Close image picker"
            disabled={busy}
            size="icon-sm"
            variant="ghost"
            onClick={close}
          >
            <X />
          </Button>
        </div>
        <label className="mb-5 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-input p-3 text-sm font-medium hover:bg-muted">
          <Upload aria-hidden className="size-4" />
          {busy ? 'Uploading…' : 'Upload image'}
          <input
            aria-label={`Upload ${label.toLowerCase()}`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void upload(file)
            }}
          />
        </label>
        {(error || query.error) && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {error ?? query.error?.message}
          </p>
        )}
        {query.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading images…
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {query.data?.images.map((image) => (
              <button
                type="button"
                key={image.id}
                disabled={busy}
                aria-label={`Use ${image.altText || 'image'}`}
                onClick={() => choose(image.id)}
                className="aspect-square overflow-hidden rounded-md border border-border hover:border-primary"
              >
                <img
                  src={`${base}/${encodeURIComponent(image.id)}`}
                  alt={image.altText}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
        {!query.isLoading &&
          !query.error &&
          query.data?.images.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No images yet
            </p>
          )}
        <div className="mt-5 flex justify-between">
          <Button
            aria-label="Previous images"
            size="icon-sm"
            variant="ghost"
            disabled={pages.length === 1 || busy || query.isLoading}
            onClick={() => setPages((value) => value.slice(0, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label="Next images"
            size="icon-sm"
            variant="ghost"
            disabled={!query.data?.nextCursor || busy || query.isLoading}
            onClick={() =>
              setPages((value) => [...value, query.data!.nextCursor])
            }
          >
            <ChevronRight />
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Selected images become public when you publish.
        </p>
      </dialog>
    </div>
  )
}
