import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Fingerprint, KeyRound } from 'lucide-react'
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'

export function SignInPage() {
  const config = useApiQuery<{ local: boolean; access: boolean }>(
    '/api/auth/status',
  )
  const [enrollment] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get('enroll'),
  )
  const [setup, setSetup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    // Enrollment capabilities never remain in the visible URL or browser history.
    if (window.location.hash)
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
    return () => {
      active.current = false
    }
  }, [])
  function destination() {
    const value =
      new URLSearchParams(window.location.search).get('returnTo') ?? '/app'
    const url = new URL(value, window.location.origin)
    return url.origin === window.location.origin &&
      (url.pathname === '/app' || url.pathname.startsWith('/app/'))
      ? url.pathname + url.search
      : '/app'
  }
  async function signIn(enrollToken?: string, bootstrap = false) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (enrollToken) {
        const optionsJSON =
          await apiRequest<PublicKeyCredentialCreationOptionsJSON>(
            '/api/auth/enroll/start',
            {
              method: 'POST',
              body: JSON.stringify({ token: enrollToken, bootstrap }),
            },
          )
        if (!active.current) return
        const credential = await startRegistration({ optionsJSON })
        if (!active.current) return
        await apiRequest('/api/auth/enroll/finish', {
          method: 'POST',
          body: JSON.stringify(credential),
        })
      } else {
        const optionsJSON =
          await apiRequest<PublicKeyCredentialRequestOptionsJSON>(
            '/api/auth/start',
            { method: 'POST', body: '{}' },
          )
        if (!active.current) return
        const credential = await startAuthentication({ optionsJSON })
        if (!active.current) return
        await apiRequest('/api/auth/finish', {
          method: 'POST',
          body: JSON.stringify(credential),
        })
      }
      if (active.current) window.location.assign(destination())
    } catch (caught) {
      if (active.current)
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Passkey sign-in was not completed. Try again.',
        )
    } finally {
      if (active.current) setBusy(false)
    }
  }
  function bootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const value = String(new FormData(form).get('setupToken') ?? '').trim()
    form.reset()
    void signIn(value, true)
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="grid w-full max-w-sm gap-6">
        <Fingerprint aria-hidden className="size-9 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          {enrollment || setup ? 'Set up your passkey' : 'Sign in'}
        </h1>
        {config.isLoading ? (
          <p role="status">Loading…</p>
        ) : config.error ? (
          <p role="alert">Sign-in is unavailable. Please try again.</p>
        ) : (
          <>
            {config.data?.local &&
              (setup ? (
                <form className="grid gap-4" onSubmit={bootstrap}>
                  <Field label="Setup key" htmlFor="setup-token">
                    <Input
                      id="setup-token"
                      name="setupToken"
                      type="password"
                      autoComplete="off"
                      required
                      disabled={busy}
                    />
                  </Field>
                  <Button disabled={busy} type="submit">
                    <KeyRound aria-hidden />
                    {busy ? 'Waiting for passkey…' : 'Create passkey'}
                  </Button>
                </form>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() => void signIn(enrollment ?? undefined)}
                >
                  <Fingerprint aria-hidden />
                  {busy
                    ? 'Waiting for passkey…'
                    : enrollment
                      ? 'Create passkey'
                      : 'Use passkey'}
                </Button>
              ))}
            {config.data?.access && !enrollment && !setup && (
              <Button asChild variant="secondary">
                <a href="/cdn-cgi/access/login">Organization sign-in</a>
              </Button>
            )}
            {!config.data?.local && !config.data?.access && (
              <p role="status">Ask your administrator to configure sign-in.</p>
            )}
            {config.data?.local && !enrollment && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setSetup(!setup)
                  setError(null)
                }}
              >
                {setup ? 'Back to sign-in' : 'First owner setup'}
              </Button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <a className="text-sm text-muted-foreground" href="/">
          Church website
        </a>
      </div>
    </main>
  )
}
