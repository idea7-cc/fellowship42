import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Fingerprint, KeyRound } from 'lucide-react'
import {
  WebAuthnAbortService,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'

export function SignInPage({ navigation }: { navigation?: { hash: string } }) {
  const config = useApiQuery<{ local: boolean; access: boolean }>(
    '/api/auth/status',
  )
  const [enrollment] = useState(() =>
    new URLSearchParams(
      (navigation?.hash ?? window.location.hash).slice(1),
    ).get('enroll'),
  )
  const [setup, setSetup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A setup link is single-use. After the server refused it, or after its
  // final step went unanswered, the passkey may already exist: offer it.
  const [linkSpent, setLinkSpent] = useState<'refused' | 'unconfirmed' | null>(
    null,
  )
  const active = useRef(true)
  useEffect(() => {
    const stripFragment = () => {
      if (window.location.hash)
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname + window.location.search,
        )
    }
    stripFragment()
    // Repeated native fragment navigation can be memoized by React Router.
    // Its history listener reads the new location before these passive handlers.
    window.addEventListener('popstate', stripFragment)
    window.addEventListener('hashchange', stripFragment)
    active.current = true
    return () => {
      window.removeEventListener('popstate', stripFragment)
      window.removeEventListener('hashchange', stripFragment)
      active.current = false
      WebAuthnAbortService.cancelCeremony()
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
    // Which step failed decides what a failure can mean for a setup link.
    let step: 'start' | 'ceremony' | 'finish' = 'start'
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
        step = 'ceremony'
        const credential = await startRegistration({ optionsJSON })
        if (!active.current) return
        step = 'finish'
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
      if (!active.current) return
      const answered = caught instanceof ApiError && caught.status < 500
      if (
        enrollToken &&
        step === 'start' &&
        caught instanceof ApiError &&
        caught.status === 400 &&
        caught.code === 'sign_in_failed'
      ) {
        // The Worker's answer for a link that is used, expired or unknown.
        setLinkSpent('refused')
        setError(
          'This setup link can no longer be used. If you already created a passkey with it, use that passkey to sign in. If setup never finished, ask your church administrator for a fresh link.',
        )
      } else if (enrollToken && step === 'finish' && !answered) {
        // The passkey may have been saved even though no answer arrived.
        setLinkSpent('unconfirmed')
        setError(
          'We could not confirm that your passkey was saved. Try signing in with it first; if it is not offered, create it again.',
        )
      } else {
        // Rate limits, outages before the passkey exists, a cancelled
        // ceremony or a refused finish: the link is still worth retrying.
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Passkey sign-in was not completed. Try again.',
        )
      }
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
              ) : linkSpent ? (
                <>
                  <Button disabled={busy} onClick={() => void signIn()}>
                    <Fingerprint aria-hidden />
                    {busy ? 'Waiting for passkey…' : 'Use existing passkey'}
                  </Button>
                  {linkSpent === 'unconfirmed' && enrollment ? (
                    <Button
                      disabled={busy}
                      onClick={() => void signIn(enrollment)}
                      variant="secondary"
                    >
                      Create passkey again
                    </Button>
                  ) : null}
                </>
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
                  setLinkSpent(null)
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
