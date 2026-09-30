import { useEffect, useRef, useState } from 'react'
import { ExternalLink, KeyRound } from 'lucide-react'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface WebsiteSetup {
  origin: string | null
  editorUrl: string | null
  setupAvailable: boolean
}

/**
 * Where the church website lives and who edits what. Owners of a new
 * installation also claim the website editor's first administrator here.
 */
export function WebsiteCard({
  churchId,
  owner,
  navigate = (url) => window.location.assign(url),
}: {
  churchId: string
  owner: boolean
  navigate?: (url: string) => void
}) {
  const query = useApiQuery<WebsiteSetup>(
    `/api/website-setup/${encodeURIComponent(churchId)}`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function claim() {
    setBusy(true)
    setError(null)
    try {
      const { url } = await apiRequest<{ url: string }>(
        `/api/website-setup/${encodeURIComponent(churchId)}/claim`,
        { method: 'POST' },
      )
      if (mounted.current) navigate(url)
    } catch (caught) {
      if (!mounted.current) return
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Website setup could not be started. Try again.',
      )
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const website = query.data
  return (
    <Card className="mb-6" aria-labelledby="website-card-title">
      <div className="grid gap-3 text-sm">
        <h2 id="website-card-title" className="text-base font-semibold">
          Website
        </h2>
        {!website ? (
          query.error ? (
            <p role="alert">{query.error.message}</p>
          ) : (
            <p className="text-muted-foreground">Loading website details…</p>
          )
        ) : website.origin ? (
          <>
            <p>
              Your public website is{' '}
              <a
                href={website.origin}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-text underline underline-offset-2"
              >
                {website.origin.replace(/^https?:\/\//, '')}
              </a>
              .
            </p>
            <ul className="grid gap-1 text-muted-foreground">
              <li>
                Pages, articles, and menus are edited in the website editor.
                Publishing a page there makes that page public.
              </li>
              <li>
                Church details, gatherings, events, sermons, groups, and courses
                are edited here. Publishing here updates the website the next
                time a page loads; withdrawing an item removes it.
              </li>
              <li>
                Website editor accounts are separate and grant no access to
                people, giving, or settings here.
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              {website.editorUrl && (
                <Button asChild size="sm" variant="secondary">
                  <a href={website.editorUrl} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden />
                    Open website editor
                  </a>
                </Button>
              )}
              {owner && website.setupAvailable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void claim()}
                >
                  <KeyRound aria-hidden />
                  {busy ? 'Starting setup…' : 'Set up website editor'}
                </Button>
              )}
            </div>
            {owner && website.setupAvailable && (
              <p className="text-muted-foreground">
                For a new website: creates the editor's first administrator with
                your passkey. The setup link works for ten minutes.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </>
        ) : (
          <p className="text-muted-foreground">
            No church website is connected to this installation. Visitors see
            the page at this address, and an EmDash website can show this
            church&apos;s published information by connecting to it.
          </p>
        )}
      </div>
    </Card>
  )
}
