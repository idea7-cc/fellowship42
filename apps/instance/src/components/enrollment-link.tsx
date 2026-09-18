import { useEffect, useRef, useState } from 'react'
import { Link, X } from 'lucide-react'
import { apiRequest, ApiError } from '@/lib/api'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function EnrollmentLink({
  churchId,
  membershipId,
  version,
  name,
}: {
  churchId: string
  membershipId: string
  version: number
  name: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  async function issue() {
    setBusy(true)
    setError(null)
    setUrl(null)
    try {
      const result = await apiRequest<{ url: string }>(
        `/api/auth/invitations/${encodeURIComponent(churchId)}/${encodeURIComponent(membershipId)}`,
        { method: 'POST', body: JSON.stringify({ version }) },
      )
      if (active.current) setUrl(result.url)
    } catch (caught) {
      if (active.current)
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Unable to create enrollment link.',
        )
    } finally {
      if (active.current) setBusy(false)
    }
  }
  return (
    <div>
      <Button
        aria-label={`Create sign-in link for ${name}`}
        title="Create sign-in link"
        disabled={busy}
        onClick={() => void issue()}
        size="icon-xs"
        variant="ghost"
      >
        <Link aria-hidden />
      </Button>
      {url && (
        <div className="flex max-w-xs items-center gap-1">
          <Input
            aria-label={`Private enrollment link for ${name}`}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            aria-label="Dismiss enrollment link"
            size="icon-xs"
            variant="ghost"
            onClick={() => setUrl(null)}
          >
            <X aria-hidden />
          </Button>
        </div>
      )}
      {url && (
        <p className="max-w-xs text-left text-xs text-muted-foreground">
          Share privately with {name}. Expires in 24 hours.
        </p>
      )}
      {error && (
        <p role="alert" className="max-w-xs text-left text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
