import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { SignInButton, SignOutButton } from '@/lib/auth-provider'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import type { BootstrapResponse, BootstrapStatusResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-xl">
        <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">
          Fellowship42 · Instance setup
        </p>
        {children}
      </div>
    </main>
  )
}

function SetupField({
  label,
  hint,
  ...inputProps
}: React.ComponentProps<typeof Input> & { label: string; hint?: string }) {
  const id = useMemo(() => `bootstrap-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, [label])
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm font-semibold">
      {label}
      <Input id={id} {...inputProps} />
      {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

function BootstrapForm({ refetch }: { refetch: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  const defaultLocale = navigator.language || 'en-US'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const result = await apiRequest<BootstrapResponse>('/api/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          slug: form.get('slug'),
          timezone: form.get('timezone'),
          locale: form.get('locale'),
          countryCode: form.get('countryCode'),
        }),
      })
      await refetch()
      window.location.assign(`/churches/${encodeURIComponent(result.instance.churchId)}`)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The instance could not be initialized. Try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create this church instance</CardTitle>
        <CardDescription>
          This creates one portable church, its permanent instance identity, and your first owner
          membership. It does not connect Fellowship42 Cloud.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-6">
        <form className="grid gap-5" onSubmit={submit}>
          <SetupField label="Church name" name="name" required minLength={2} maxLength={120} autoFocus />
          <SetupField
            label="Church slug"
            name="slug"
            required
            minLength={2}
            maxLength={64}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="grace-community"
            hint="Lowercase letters, numbers, and single hyphens."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <SetupField label="Timezone" name="timezone" required defaultValue={defaultTimezone} />
            <SetupField label="Locale" name="locale" required defaultValue={defaultLocale} />
          </div>
          <SetupField
            label="Country code"
            name="countryCode"
            required
            defaultValue="US"
            minLength={2}
            maxLength={2}
            pattern="[A-Za-z]{2}"
          />
          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating instance…' : 'Create church instance'}
            </Button>
            <SignOutButton />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function BootstrapGate({ children }: { children: ReactNode }) {
  const { data, error, isLoading, refetch } = useApiQuery<BootstrapStatusResponse>('/api/bootstrap')

  if (isLoading) {
    return (
      <Page>
        <Card><CardContent><p>Checking instance setup…</p></CardContent></Card>
      </Page>
    )
  }

  if (error || !data) {
    return (
      <Page>
        <Card>
          <CardHeader>
            <CardTitle>Setup status is unavailable</CardTitle>
            <CardDescription>{error?.message ?? 'The instance did not return a setup status.'}</CardDescription>
          </CardHeader>
          <CardContent className="mt-5">
            <Button onClick={() => void refetch()}>Try again</Button>
          </CardContent>
        </Card>
      </Page>
    )
  }

  if (data.state === 'configured') return children

  if (!data.ownerConfigured) {
    return (
      <Page>
        <Card>
          <CardHeader>
            <CardTitle>First owner configuration required</CardTitle>
            <CardDescription>
              Set the deployment-scoped <code>BOOTSTRAP_OWNER_EMAIL</code> Worker secret to the
              exact email allowed to initialize this instance, then reload this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </Page>
    )
  }

  if (!data.authenticated) {
    return (
      <Page>
        <Card>
          <CardHeader>
            <CardTitle>Sign in as the first owner</CardTitle>
            <CardDescription>
              Cloudflare Access verifies the identity selected during deployment before setup can
              create any church records.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-5"><SignInButton /></CardContent>
        </Card>
      </Page>
    )
  }

  if (!data.eligible) {
    return (
      <Page>
        <Card>
          <CardHeader>
            <CardTitle>This account is not the configured first owner</CardTitle>
            <CardDescription>
              Sign out and use the exact Access identity selected for this deployment. The expected
              email is never returned to the browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-5"><SignOutButton /></CardContent>
        </Card>
      </Page>
    )
  }

  return <Page><BootstrapForm refetch={refetch} /></Page>
}
