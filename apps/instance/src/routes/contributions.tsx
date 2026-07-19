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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import { useAuthState } from '@/lib/auth-provider'
import type { Contribution, CursorPage } from '@/lib/api-types'

function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

function formatMoney(amountMinor: number, currency: string) {
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    })
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
    return formatter.format(amountMinor / 10 ** digits)
  } catch {
    return `${amountMinor} ${currency} minor units`
  }
}

export function ContributionsPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canRead = can(permissions, 'contributions.read')
  const canWrite = can(permissions, 'contributions.write')
  const contributionsQuery = useApiQuery<{
    contributions: Contribution[]
    page: CursorPage
  }>(
    churchId && canRead
      ? `/api/contributions/${encodeURIComponent(churchId)}?limit=100`
      : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function createContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!churchId) return
    setSaving(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      await apiRequest(`/api/contributions/${encodeURIComponent(churchId)}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `manual-${crypto.randomUUID()}` },
        body: JSON.stringify({
          donorName: String(form.get('donorName') ?? ''),
          amountMinor: Number(form.get('amountMinor')),
          currency: String(form.get('currency') ?? 'USD'),
          fund: String(form.get('fund') ?? ''),
          paymentMethod: String(form.get('paymentMethod') ?? 'cash'),
          recurring: form.get('recurring') === 'on',
          donatedAt: new Date(String(form.get('donatedAt'))).toISOString(),
        }),
      })
      event.currentTarget.reset()
      await contributionsQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The contribution could not be recorded.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <Section>
        <Eyebrow>Finance</Eyebrow>
        <h1>Contributions</h1>
        <p className="mt-2">
          Finance-scoped records stay inside this church instance. Payment
          providers submit only authenticated, normalized events.
        </p>
      </Section>
      <Section>
        {!canRead ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              Finance permission is required to view contribution records.
            </CardContent>
          </Card>
        ) : (
          <>
            {canWrite ? (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Record an offline contribution</CardTitle>
                  <CardDescription>
                    Use this for cash, checks, or another manually reconciled
                    payment. Amounts are stored as integer minor units.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={createContribution}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm font-semibold">
                        Donor name
                        <Input name="donorName" required maxLength={200} />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Amount in minor units
                        <Input
                          name="amountMinor"
                          type="number"
                          min={1}
                          step={1}
                          required
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Currency
                        <Input
                          name="currency"
                          minLength={3}
                          maxLength={3}
                          defaultValue="USD"
                          required
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Fund
                        <Input
                          name="fund"
                          maxLength={160}
                          defaultValue="General"
                          required
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Payment method
                        <Input
                          name="paymentMethod"
                          maxLength={80}
                          defaultValue="cash"
                          required
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Donated at
                        <Input
                          name="donatedAt"
                          type="datetime-local"
                          required
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input name="recurring" type="checkbox" />
                      Recurring contribution
                    </label>
                    {error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? 'Recording…' : 'Record contribution'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {contributionsQuery.isLoading ? (
              <p>Loading contributions…</p>
            ) : contributionsQuery.error ? (
              <Card className="border-destructive/30">
                <CardContent className="p-6 text-destructive">
                  {contributionsQuery.error.message}
                </CardContent>
              </Card>
            ) : contributionsQuery.data?.contributions.length ? (
              <div className="grid gap-3">
                {contributionsQuery.data.contributions.map((contribution) => (
                  <Card key={contribution.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle>{contribution.donorName}</CardTitle>
                          <CardDescription>
                            {contribution.fund} ·{' '}
                            {new Date(contribution.donatedAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold">
                            {formatMoney(
                              contribution.amountMinor,
                              contribution.currency,
                            )}
                          </p>
                          <Badge variant="outline">{contribution.status}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {contribution.paymentMethod}
                      {contribution.provider
                        ? ` · ${contribution.provider}`
                        : ' · offline'}
                      {contribution.recurring ? ' · recurring' : ''}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center text-muted-foreground">
                  No contributions have been recorded.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Section>
    </PageShell>
  )
}
