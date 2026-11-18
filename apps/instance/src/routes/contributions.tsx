import { useState, type FormEvent } from 'react'
import { PageShell } from '@/components/page-shell'
import { PageHeader } from '@/components/page-header'
import { Section } from '@/components/section'
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
import { apiRequest, useApiQuery } from '@/lib/api'
import { formatInTimeZone, fromZonedInputValue } from '@/lib/time-zone'
import { formatMoney, parseAmount } from '@/lib/money'
import { usePagedQuery } from '@/lib/paged-query'
import { ListPager } from '@/components/list-pager'
import { ListSearch } from '@/components/list-search'
import { RequestError } from '@/components/request-error'
import {
  describeEntryFailure,
  useEntryKey,
  type EntryFailure,
} from '@/lib/entry-key'
import { useAuthState } from '@/lib/auth-provider'
import { useChurch } from '@/lib/church-context'
import type { Church, Contribution, CursorPage } from '@/lib/api-types'

function can(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

const contributionStatuses = [
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'failed', label: 'Failed' },
]

export function ContributionsPage() {
  const { churchId } = useChurch()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canRead = can(permissions, 'contributions.read')
  const canWrite = can(permissions, 'contributions.write')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('')
  const contributionsQuery = usePagedQuery<{
    contributions: Contribution[]
    page: CursorPage
  }>(
    churchId && canRead
      ? `/api/contributions/${encodeURIComponent(churchId)}`
      : null,
    { limit: 25, query: appliedSearch, status },
  )
  // Gift times are entered and shown in the church's timezone, not the zone
  // of whichever device staff use.
  const churchQuery = useApiQuery<{ church: Church }>(
    `/api/churches/${encodeURIComponent(churchId)}`,
  )
  const timeZone = churchQuery.data?.church.timezone
  const [error, setError] = useState<EntryFailure | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const entryKey = useEntryKey('contribution')

  async function createContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!churchId || !timeZone) return
    // React clears currentTarget once the handler awaits; keep the form.
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const currency = String(form.get('currency') ?? 'USD')
      .trim()
      .toUpperCase()
    const amount = parseAmount(String(form.get('amount') ?? ''), currency)
    if (!amount.ok) {
      setError({
        message: amount.message,
        uncertain: false,
        keyConflict: false,
      })
      return
    }
    const { amountMinor } = amount
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await apiRequest(`/api/contributions/${encodeURIComponent(churchId)}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': entryKey.current() },
        body: JSON.stringify({
          donorName: String(form.get('donorName') ?? ''),
          amountMinor,
          currency,
          fund: String(form.get('fund') ?? ''),
          paymentMethod: String(form.get('paymentMethod') ?? 'cash'),
          recurring: form.get('recurring') === 'on',
          donatedAt: new Date(
            fromZonedInputValue(String(form.get('donatedAt')), timeZone),
          ).toISOString(),
        }),
      })
      entryKey.reset()
      formElement.reset()
      setNotice('Contribution recorded.')
      void contributionsQuery.refetch()
    } catch (caught) {
      setError(
        describeEntryFailure(
          caught,
          'contribution',
          contributionsQuery.refetch,
          'recorded',
        ),
      )
    } finally {
      setSaving(false)
    }
  }

  function startNewEntry(form: HTMLFormElement | null) {
    entryKey.reset()
    form?.reset()
    setError(null)
    setNotice(null)
  }

  return (
    <PageShell>
      <PageHeader
        description="Finance-scoped records stay inside this church instance. Payment providers submit only authenticated, normalized events."
        eyebrow="Finance"
        title="Contributions"
      />
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
                    payment.
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
                        Amount
                        <Input
                          inputMode="decimal"
                          name="amount"
                          placeholder="25.00"
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
                          aria-describedby="donated-at-zone"
                          name="donatedAt"
                          type="datetime-local"
                          required
                        />
                        <span
                          className="text-xs font-normal text-muted-foreground"
                          id="donated-at-zone"
                        >
                          {timeZone
                            ? `In ${timeZone}, the church's timezone.`
                            : churchQuery.error
                              ? "The church's timezone could not be loaded, so the time cannot be recorded yet."
                              : "Loading the church's timezone…"}
                        </span>
                      </label>
                    </div>
                    {!timeZone && churchQuery.error ? (
                      // The draft stays as typed while the read is retried.
                      <RequestError
                        error={churchQuery.error}
                        onRetry={() => void churchQuery.refetch()}
                      />
                    ) : null}
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input name="recurring" type="checkbox" />
                      Recurring contribution
                    </label>
                    {error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {error.message}
                      </p>
                    ) : null}
                    {notice ? (
                      <p
                        className="rounded-md bg-success-soft p-2.5 text-sm text-success-soft-foreground"
                        role="status"
                      >
                        {notice}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={saving || !timeZone}
                      >
                        {saving ? 'Recording…' : 'Record contribution'}
                      </Button>
                      {error ? (
                        <Button
                          disabled={saving}
                          onClick={(event) =>
                            startNewEntry(event.currentTarget.form)
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Start a new entry
                        </Button>
                      ) : null}
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <ListSearch
              label="Search donor or fund"
              onSearch={setAppliedSearch}
              status={{
                value: status,
                onChange: setStatus,
                label: 'Contribution status',
                options: contributionStatuses,
              }}
            />
            {contributionsQuery.isLoading && !contributionsQuery.data ? (
              <p>Loading contributions…</p>
            ) : contributionsQuery.error ? (
              <RequestError
                error={contributionsQuery.error}
                onRetry={() => void contributionsQuery.refetch()}
              />
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
                            {timeZone
                              ? `${formatInTimeZone(contribution.donatedAt, timeZone)} (${timeZone})`
                              : null}
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
                  {appliedSearch || status
                    ? 'No contributions match this search.'
                    : 'No contributions have been recorded.'}
                </CardContent>
              </Card>
            )}
            <ListPager
              label="Contribution pages"
              {...contributionsQuery.pager}
            />
          </>
        )}
      </Section>
    </PageShell>
  )
}
