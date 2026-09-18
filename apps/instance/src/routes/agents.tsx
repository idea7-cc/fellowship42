import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, Check, Copy, Eye, FilePenLine, Unplug } from 'lucide-react'
import {
  scopeLabels,
  type AgentConsent,
  type AgentConnections,
} from '../../contracts/agents'
import { apiRequest, useApiQuery } from '@/lib/api'
import { useChurch } from '@/lib/church-context'
import { PageShell } from '@/components/page-shell'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export function AgentsPage() {
  const { churchId } = useChurch()
  return <AgentConnectionsPanel key={churchId} churchId={churchId} />
}
export function AgentConnectionsPanel({ churchId }: { churchId: string }) {
  const query = useApiQuery<AgentConnections>(
    `/api/agents/${encodeURIComponent(churchId)}`,
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const active = useRef(false)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  async function revoke(id: string) {
    if (busy) return
    setBusy(id)
    setError('')
    try {
      await apiRequest(
        `/api/agents/${encodeURIComponent(churchId)}/${encodeURIComponent(id)}/revoke`,
        { method: 'POST' },
      )
      if (active.current) await query.refetch()
    } catch (caught) {
      if (active.current)
        setError(
          caught instanceof Error ? caught.message : 'Could not disconnect.',
        )
    } finally {
      if (active.current) setBusy(null)
    }
  }
  const current =
    query.data?.connections.filter(
      (item) => !item.revokedAt && item.expiresAt > Date.now(),
    ) ?? []
  return (
    <PageShell>
      <PageHeader title="Agents" />
      {(error || query.error) && (
        <p role="alert">{error || query.error?.message}</p>
      )}
      {!query.data ? (
        query.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <Button onClick={() => void query.refetch()}>Try again</Button>
        )
      ) : (
        <div className="max-w-2xl space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Bot className="size-5 text-muted-foreground" aria-hidden />
              <h2 className="font-medium">Connect your agent</h2>
            </div>
            {query.data.endpoint ? (
              <>
                <div className="flex gap-2">
                  <Input
                    aria-label="MCP address"
                    value={query.data.endpoint}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <Button
                    variant="secondary"
                    aria-label={copied ? 'Copied address' : 'Copy address'}
                    size="icon"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(query.data!.endpoint!)
                        .then(() => {
                          if (active.current) setCopied(true)
                        })
                        .catch(() => {
                          if (active.current)
                            setError('Select and copy the address above.')
                        })
                    }}
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Add this address in your agent, then approve its access here.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your instance operator needs to enable agent connections.
              </p>
            )}
          </Card>
          {current.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {current.map((item) => (
                <li key={item.id} className="flex items-start gap-3 p-4">
                  <Bot
                    className="mt-1 size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{item.clientName}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.scopes.includes('draft:write')
                        ? 'Website draft editing'
                        : item.scopes.includes('events:write')
                          ? 'Event drafts'
                          : 'Read only'}
                    </p>
                    <details className="mt-2 text-sm text-muted-foreground">
                      <summary className="cursor-pointer">
                        Access details
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {item.scopes.map((scope) => (
                          <li key={scope}>{scopeLabels[scope]}</li>
                        ))}
                      </ul>
                      <p className="mt-2 break-all">{item.clientId}</p>
                      <p className="mt-1">
                        Expires {new Date(item.expiresAt).toLocaleDateString()}
                      </p>
                    </details>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => void revoke(item.id)}
                  >
                    <Unplug />
                    {busy === item.id ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No connected agents.
            </p>
          )}
        </div>
      )}
    </PageShell>
  )
}

export function AgentConsentPage() {
  const location = useLocation()
  return (
    <AgentConsentPanel key={location.search} queryString={location.search} />
  )
}
export function AgentConsentPanel({
  queryString,
  navigate = (url) => window.location.assign(url),
}: {
  queryString: string
  navigate?: (url: string) => void
}) {
  const query = useApiQuery<AgentConsent>(`/api/agents/consent${queryString}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  async function decide(decision: 'allow' | 'deny') {
    if (!query.data || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await apiRequest<{ redirectTo: string }>(
        '/api/agents/consent',
        {
          method: 'POST',
          body: JSON.stringify({ requestId: query.data.requestId, decision }),
        },
      )
      if (active.current) navigate(result.redirectTo)
    } catch (caught) {
      if (active.current) {
        setError(
          caught instanceof Error ? caught.message : 'Could not connect.',
        )
        setBusy(false)
      }
    }
  }
  const consent = query.data
  return (
    <PageShell>
      <div className="mx-auto max-w-md py-8">
        <Card padding="lg" className="space-y-6">
          <Bot className="size-8 text-muted-foreground" aria-hidden />
          <h1 className="break-words text-xl font-semibold">
            {consent ? `Connect ${consent.clientName}?` : 'Connect an agent'}
          </h1>
          {(error || query.error) && (
            <p role="alert" className="text-sm">
              {error || query.error?.message}
            </p>
          )}
          {!consent ? (
            query.isLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <Button variant="secondary" onClick={() => void query.refetch()}>
                Try again
              </Button>
            )
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground break-all">
                  {consent.redirectOrigin}
                </p>
                <p className="mt-3 font-medium">{consent.churchName}</p>
              </div>
              <ul className="space-y-3">
                {consent.scopes.map((scope) => (
                  <li key={scope} className="flex gap-3 text-sm">
                    {scope.endsWith(':write') ? (
                      <FilePenLine
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : (
                      <Eye
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    {scopeLabels[scope]}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                Your agent receives this information. Publishing stays with you.
                Disconnect anytime.
              </p>
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">Connection details</summary>
                <p className="mt-2 break-all">{consent.clientId}</p>
                <p className="mt-1 break-all">
                  Returns to {consent.redirectOrigin}
                </p>
              </details>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void decide('deny')}
                >
                  Cancel
                </Button>
                <Button disabled={busy} onClick={() => void decide('allow')}>
                  {busy ? 'Connecting…' : 'Connect'}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </PageShell>
  )
}
