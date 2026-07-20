import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Eyebrow } from '@/components/eyebrow'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import type {
  EnrollmentChallenge,
  ManagementCapability,
  ManagementExitDispositionResponse,
  ManagementStatusResponse,
  UpdatePreparation,
  UpdatePreparationsResponse,
} from '@/lib/api-types'
import { useAuthState } from '@/lib/auth-provider'

const capabilityDetails: Record<
  ManagementCapability,
  { label: string; description: string; localApproval: boolean }
> = {
  'instance.status.read': {
    label: 'Instance status',
    description: 'Read only bounded application and storage readiness.',
    localApproval: false,
  },
  'instance.health.read': {
    label: 'Fleet health observation',
    description:
      'Read strict, privacy-bounded readiness and aggregate traffic bands.',
    localApproval: false,
  },
  'backup.export': {
    label: 'Portable export',
    description: 'Request an auditable portable backup operation.',
    localApproval: false,
  },
  'update.prepare': {
    label: 'Prepare update',
    description: 'Verify and stage a compatible immutable release.',
    localApproval: false,
  },
  'update.apply': {
    label: 'Apply update',
    description: 'Apply a prepared release only after a fresh local approval.',
    localApproval: true,
  },
  'support.session.request': {
    label: 'Request support session',
    description: 'Ask for narrow, time-limited support access.',
    localApproval: true,
  },
  'management.disconnect': {
    label: 'Request disconnect',
    description: 'Ask the church to review a management disconnect.',
    localApproval: true,
  },
}

function hasPermission(permissions: string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission)
}

function displayTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not yet'
}

function shortFingerprint(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`
}

export function ManagementPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((entry) => entry.churchId === churchId)
      ?.permissions ?? []
  const canAdmin = hasPermission(permissions, 'management.admin')
  const status = useApiQuery<ManagementStatusResponse>(
    canAdmin ? '/api/management' : null,
  )
  const updates = useApiQuery<UpdatePreparationsResponse>(
    canAdmin ? '/api/management/updates' : null,
  )
  const pending = status.data?.pendingEnrollment
  const [challenge, setChallenge] = useState<EnrollmentChallenge | null>(null)
  const [selected, setSelected] = useState<ManagementCapability[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rotationConfirmation, setRotationConfirmation] = useState('')
  const [disconnectConfirmation, setDisconnectConfirmation] = useState('')
  const [disconnectReason, setDisconnectReason] = useState('')
  const [updateConfirmation, setUpdateConfirmation] = useState('')
  const [supportDecisionReason, setSupportDecisionReason] = useState('')

  const currentUpdate: UpdatePreparation | undefined =
    updates.data?.preparations[0]

  useEffect(() => {
    setSelected([])
  }, [pending?.challengeId])

  const handoff = useMemo(
    () =>
      challenge
        ? JSON.stringify(
            {
              challenge,
              proposalSubmissionUrl: `${window.location.origin}/api/management/proposals`,
            },
            null,
            2,
          )
        : null,
    [challenge],
  )

  async function action(name: string, callback: () => Promise<void>) {
    setBusy(name)
    setError(null)
    setNotice(null)
    try {
      await callback()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The management action could not be completed.',
      )
    } finally {
      setBusy(null)
    }
  }

  async function createChallenge() {
    await action('challenge', async () => {
      const created = await apiRequest<EnrollmentChallenge>(
        '/api/management/challenges',
        { method: 'POST' },
      )
      setChallenge(created)
      setNotice('A new 15-minute enrollment handoff is ready.')
      await status.refetch()
    })
  }

  async function copyHandoff() {
    if (!handoff) return
    await action('copy', async () => {
      await navigator.clipboard.writeText(handoff)
      setNotice('Enrollment handoff copied. Share it only with the intended operator.')
    })
  }

  async function approve() {
    if (!pending || selected.length === 0) return
    await action('approve', async () => {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000)
      await apiRequest('/api/management/approve', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: pending.challengeId,
          grants: {
            grantVersion: 1,
            grants: selected.map((capability) => ({
              capability,
              grantedAt: now.toISOString(),
              expiresAt: expiresAt.toISOString(),
              requiresLocalApproval:
                capabilityDetails[capability].localApproval,
            })),
            approvedAt: now.toISOString(),
            reviewDueAt: expiresAt.toISOString(),
          },
        }),
      })
      setChallenge(null)
      setNotice('The operator was approved with the selected 30-day grants.')
      await status.refetch()
    })
  }

  async function rotate() {
    if (rotationConfirmation !== 'ROTATE') return
    await action('rotate', async () => {
      await apiRequest('/api/management/rotate', { method: 'POST' })
      setRotationConfirmation('')
      setNotice('A signed identity rotation is queued for the next sync.')
      await status.refetch()
    })
  }

  async function disconnect() {
    if (disconnectConfirmation !== 'DISCONNECT' || !disconnectReason.trim()) {
      return
    }
    await action('disconnect', async () => {
      await apiRequest('/api/management/disconnect', {
        method: 'POST',
        body: JSON.stringify({ reason: disconnectReason.trim() }),
      })
      setDisconnectConfirmation('')
      setDisconnectReason('')
      setChallenge(null)
      setNotice('Management was disconnected locally. Church operations remain available.')
      await status.refetch()
    })
  }

  async function downloadExitDisposition() {
    await action('exit-disposition', async () => {
      const disposition = await apiRequest<ManagementExitDispositionResponse>(
        '/api/management/exit-disposition',
      )
      const blob = new Blob([`${JSON.stringify(disposition, null, 2)}\n`], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `f42-management-exit-${disposition.connectionId}.json`
      link.click()
      URL.revokeObjectURL(url)
      setNotice('Local management revocation evidence was downloaded.')
    })
  }

  async function approvePreparedUpdate() {
    if (
      !currentUpdate ||
      currentUpdate.state !== 'awaiting-local-approval' ||
      updateConfirmation !== `APPROVE ${currentUpdate.target.releaseTag}`
    ) {
      return
    }
    await action('approve-update', async () => {
      await apiRequest(
        `/api/management/updates/${currentUpdate.preparationId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            releaseTag: currentUpdate.target.releaseTag,
            releaseManifestSha256:
              currentUpdate.target.releaseManifestSha256,
          }),
        },
      )
      setUpdateConfirmation('')
      setNotice(
        'The exact release is approved for 30 minutes. The operator may now request deployment authorization.',
      )
      await updates.refetch()
    })
  }

  async function decideSupport(
    requestId: string,
    decision: 'approve' | 'reject' | 'revoke',
  ) {
    if (decision !== 'approve' && !supportDecisionReason.trim()) return
    await action(`support-${requestId}-${decision}`, async () => {
      await apiRequest(`/api/management/support-sessions/${requestId}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          action: decision,
          ...(decision === 'approve'
            ? {}
            : { reason: supportDecisionReason.trim() }),
        }),
      })
      setSupportDecisionReason('')
      setNotice(
        decision === 'approve'
          ? 'The diagnostic support session is active for its requested window.'
          : decision === 'reject'
            ? 'The support request was rejected locally.'
            : 'The support session was revoked locally.',
      )
      await status.refetch()
    })
  }

  return (
    <PageShell>
      <Section>
        <Eyebrow>Church ownership</Eyebrow>
        <h1>Optional management</h1>
        <p className="mt-2 max-w-3xl">
          Review exactly who can manage this instance and what they may ask it
          to do. The church remains authoritative and can disconnect locally at
          any time without affecting normal operation or export.
        </p>
      </Section>

      <Section>
        {!canAdmin ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              Church-owner management permission is required.
            </CardContent>
          </Card>
        ) : status.isLoading ? (
          <p>Loading management state…</p>
        ) : status.error ? (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-destructive">
              {status.error.message}
            </CardContent>
          </Card>
        ) : status.data ? (
          <div className="grid gap-6">
            {error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : null}
            {notice ? (
              <p role="status" className="text-sm text-accent-strong">{notice}</p>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <Badge variant={status.data.enabled ? 'pill' : 'outline'}>
                    {status.data.enabled ? 'Connected' : 'Independent'}
                  </Badge>
                  <CardTitle>Connection</CardTitle>
                  <CardDescription>
                    {status.data.enabled
                      ? 'This instance has one active optional operator.'
                      : 'No management capability is currently enabled.'}
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <Badge variant="muted">Portable identity</Badge>
                  <CardTitle className="break-all text-base">
                    {status.data.instanceId}
                  </CardTitle>
                  <CardDescription>
                    This identity survives account and operator changes.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <Badge variant="muted">Last sync</Badge>
                  <CardTitle>
                    {displayTime(status.data.connection?.lastSyncAt ?? null)}
                  </CardTitle>
                  <CardDescription>
                    {status.data.connection?.lastSyncStatus ?? 'No connected sync'}
                    {status.data.connection?.lastSyncCode
                      ? ` · ${status.data.connection.lastSyncCode}`
                      : ''}
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            {!status.data.connection && status.data.lastDisposition ? (
              <Card>
                <CardHeader>
                  <Badge variant="outline">Locally verified</Badge>
                  <CardTitle>Exit and transfer evidence</CardTitle>
                  <CardDescription>
                    Management was disconnected{' '}
                    {displayTime(status.data.lastDisposition.disconnectedAt)}.
                    Download the instance-generated record of local revocation
                    to include in an independently verifiable exit packet.
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-4">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Connection</dt>
                      <dd className="break-all font-mono">
                        {status.data.lastDisposition.connectionId}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Former operator</dt>
                      <dd className="break-all font-mono">
                        {status.data.lastDisposition.operatorId}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadExitDisposition()}
                    disabled={busy !== null}
                  >
                    {busy === 'exit-disposition'
                      ? 'Verifying…'
                      : 'Download revocation evidence'}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {!status.data.connection ? (
              <Card>
                <CardHeader>
                  <CardTitle>Enroll an operator</CardTitle>
                  <CardDescription>
                    Create a one-use handoff, give it only to the intended
                    operator, then return here to inspect and approve the signed
                    proposal. Creating a newer handoff invalidates the old one.
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void createChallenge()}
                    disabled={busy !== null}
                  >
                    {busy === 'challenge' ? 'Creating…' : 'Create 15-minute handoff'}
                  </Button>
                  {challenge && handoff ? (
                    <div className="grid gap-3 rounded-lg border border-border bg-background/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">One-time enrollment handoff</p>
                          <p className="text-sm text-muted-foreground">
                            Expires {displayTime(challenge.expiresAt)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void copyHandoff()}
                          disabled={busy !== null}
                        >
                          Copy handoff
                        </Button>
                      </div>
                      <textarea
                        readOnly
                        value={handoff}
                        aria-label="One-time enrollment handoff"
                        className="min-h-48 w-full resize-y rounded-lg border border-border bg-card p-3 font-mono text-xs"
                      />
                      <p className="text-sm text-muted-foreground">
                        This contains a bearer credential. Do not email it, log
                        it, or store it after the operator submits the proposal.
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {pending && !status.data.connection ? (
              <Card>
                <CardHeader>
                  <Badge variant="outline">Local approval required</Badge>
                  <CardTitle>{pending.operator.displayName}</CardTitle>
                  <CardDescription>
                    Verify this operator and key fingerprint through a separate
                    trusted channel before granting any capability.
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-4">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Operator ID</dt>
                      <dd className="font-mono break-all">{pending.operator.id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Key fingerprint</dt>
                      <dd className="font-mono break-all">{pending.operator.keyFingerprint}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Sync endpoint</dt>
                      <dd className="font-mono break-all">{pending.operator.syncUrl}</dd>
                    </div>
                  </dl>
                  <fieldset className="grid gap-3">
                    <legend className="mb-2 font-semibold">30-day grants</legend>
                    {pending.requestedCapabilities.map((capability) => {
                      const detail = capabilityDetails[capability]
                      return (
                        <label
                          key={capability}
                          className="flex items-start gap-3 rounded-lg border border-border p-3"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selected.includes(capability)}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, capability]
                                  : current.filter((item) => item !== capability),
                              )
                            }
                          />
                          <span>
                            <span className="block font-semibold">{detail.label}</span>
                            <span className="text-sm text-muted-foreground">
                              {detail.description}
                              {detail.localApproval ? ' Every use requires local approval.' : ''}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </fieldset>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void approve()}
                    disabled={busy !== null || selected.length === 0}
                  >
                    {busy === 'approve' ? 'Approving…' : 'Approve selected grants'}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {status.data.connection ? (
              <>
                {status.data.supportSessions.some((session) =>
                  ['awaiting-local-approval', 'approved'].includes(session.state),
                ) ? (
                  <Section
                    title="Support sessions"
                    description="Every request names the operator, purpose, scope, and exact time window. Approval is local, automatically expires, and can be revoked here at any time."
                  >
                    <div className="grid gap-4">
                      {status.data.supportSessions
                        .filter((session) =>
                          ['awaiting-local-approval', 'approved'].includes(
                            session.state,
                          ),
                        )
                        .map((session) => (
                          <Card key={session.requestId}>
                            <CardHeader>
                              <Badge
                                variant={
                                  session.state === 'approved' ? 'pill' : 'outline'
                                }
                              >
                                {session.state === 'approved'
                                  ? 'Active support'
                                  : 'Approval requested'}
                              </Badge>
                              <CardTitle>
                                {session.supportOperator.displayName}
                              </CardTitle>
                              <CardDescription>{session.reason}</CardDescription>
                            </CardHeader>
                            <CardContent className="mt-4">
                              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                <div>
                                  <dt className="text-muted-foreground">Scope</dt>
                                  <dd>Operational diagnostics only</dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground">
                                    {session.state === 'approved'
                                      ? 'Automatic expiry'
                                      : 'Requested duration'}
                                  </dt>
                                  <dd>
                                    {session.state === 'approved'
                                      ? displayTime(session.expiresAt)
                                      : `${session.requestedMinutes} minutes`}
                                  </dd>
                                </div>
                              </dl>
                              {session.state === 'awaiting-local-approval' ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy !== null}
                                    onClick={() =>
                                      void decideSupport(session.requestId, 'approve')
                                    }
                                  >
                                    Approve session
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      busy !== null ||
                                      !supportDecisionReason.trim()
                                    }
                                    onClick={() =>
                                      void decideSupport(session.requestId, 'reject')
                                    }
                                  >
                                    Reject request
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={
                                    busy !== null || !supportDecisionReason.trim()
                                  }
                                  onClick={() =>
                                    void decideSupport(session.requestId, 'revoke')
                                  }
                                >
                                  Revoke now
                                </Button>
                              )}
                              <label className="grid gap-1 text-sm font-semibold">
                                Reason for rejection or revocation
                                <Input
                                  value={supportDecisionReason}
                                  onChange={(event) =>
                                    setSupportDecisionReason(event.target.value)
                                  }
                                  maxLength={240}
                                />
                              </label>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </Section>
                ) : null}
                {currentUpdate ? (
                  <Card>
                    <CardHeader>
                      <Badge
                        variant={
                          currentUpdate.state === 'awaiting-local-approval'
                            ? 'outline'
                            : 'pill'
                        }
                      >
                        {currentUpdate.state.replaceAll('-', ' ')}
                      </Badge>
                      <CardTitle>Prepared instance update</CardTitle>
                      <CardDescription>
                        The instance verified this immutable release and its
                        exact-source expand-contract policy. Approval authorizes
                        only this tag and digest; deployment credentials remain
                        with the infrastructure operator.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-4">
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted-foreground">Upgrade</dt>
                          <dd className="font-mono">
                            {currentUpdate.source.releaseTag} →{' '}
                            {currentUpdate.target.releaseTag}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Approval window</dt>
                          <dd>{displayTime(currentUpdate.expiresAt)}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">Target manifest SHA-256</dt>
                          <dd className="break-all font-mono text-xs">
                            {currentUpdate.target.releaseManifestSha256}
                          </dd>
                        </div>
                      </dl>
                      {currentUpdate.state === 'awaiting-local-approval' ? (
                        <>
                          <label className="grid gap-1 text-sm font-semibold">
                            Type APPROVE {currentUpdate.target.releaseTag} to confirm
                            <Input
                              value={updateConfirmation}
                              onChange={(event) =>
                                setUpdateConfirmation(event.target.value)
                              }
                              autoComplete="off"
                            />
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void approvePreparedUpdate()}
                            disabled={
                              busy !== null ||
                              updateConfirmation !==
                                `APPROVE ${currentUpdate.target.releaseTag}`
                            }
                          >
                            {busy === 'approve-update'
                              ? 'Approving…'
                              : 'Approve exact release'}
                          </Button>
                        </>
                      ) : currentUpdate.localApproval ? (
                        <p className="text-sm text-muted-foreground">
                          Local approval expires{' '}
                          {displayTime(currentUpdate.localApproval.expiresAt)}.
                          {currentUpdate.localApproval.consumedAt
                            ? ' It has been consumed by a signed deployment authorization.'
                            : ''}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader>
                    <Badge variant="pill">Active operator</Badge>
                    <CardTitle>{status.data.connection.operator.displayName}</CardTitle>
                    <CardDescription>
                      Approved {displayTime(status.data.connection.approvedAt)} ·
                      grant set {status.data.connection.grantVersion}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-4">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Operator key</dt>
                        <dd className="font-mono" title={status.data.connection.operator.keyFingerprint}>
                          {shortFingerprint(status.data.connection.operator.keyFingerprint)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Instance key</dt>
                        <dd className="font-mono" title={status.data.identity?.fingerprint}>
                          {status.data.identity
                            ? shortFingerprint(status.data.identity.fingerprint)
                            : 'Unavailable'}
                        </dd>
                      </div>
                    </dl>
                    <div className="grid gap-3">
                      {status.data.connection.grants.map((grant) => (
                        <div key={grant.capability} className="rounded-lg border border-border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong>{capabilityDetails[grant.capability].label}</strong>
                            {grant.requiresLocalApproval ? (
                              <Badge variant="outline">Local approval</Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Expires {displayTime(grant.expiresAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Rotate instance identity</CardTitle>
                      <CardDescription>
                        Queue an old-key-authorized replacement for the next
                        outbound sync. Normal church operation is unaffected.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-4">
                      {status.data.connection.rotationPending ? (
                        <Badge variant="outline">Rotation pending delivery</Badge>
                      ) : (
                        <>
                          <label className="grid gap-1 text-sm font-semibold">
                            Type ROTATE to confirm
                            <Input
                              value={rotationConfirmation}
                              onChange={(event) => setRotationConfirmation(event.target.value)}
                              autoComplete="off"
                            />
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void rotate()}
                            disabled={busy !== null || rotationConfirmation !== 'ROTATE'}
                          >
                            {busy === 'rotate' ? 'Queueing…' : 'Queue identity rotation'}
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-destructive/30">
                    <CardHeader>
                      <CardTitle>Disconnect locally</CardTitle>
                      <CardDescription>
                        Revoke all management grants, delete local management
                        key material, and continue operating independently.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-4">
                      <label className="grid gap-1 text-sm font-semibold">
                        Reason
                        <Input
                          value={disconnectReason}
                          onChange={(event) => setDisconnectReason(event.target.value)}
                          maxLength={240}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold">
                        Type DISCONNECT to confirm
                        <Input
                          value={disconnectConfirmation}
                          onChange={(event) => setDisconnectConfirmation(event.target.value)}
                          autoComplete="off"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void disconnect()}
                        disabled={
                          busy !== null ||
                          disconnectConfirmation !== 'DISCONNECT' ||
                          !disconnectReason.trim()
                        }
                      >
                        {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect management'}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </Section>
    </PageShell>
  )
}
