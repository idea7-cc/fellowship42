import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  Eye,
  Globe,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { presetNames, presets } from '@fellowship42/brand'
import { churchDraftSchema } from '../../contracts/church-settings'
import type {
  ChurchDraft,
  ChurchSettings,
} from '../../contracts/church-settings'
import { ApiError, apiRequest, useApiQuery } from '@/lib/api'
import { useChurch } from '@/lib/church-context'
import { useAuthState } from '@/lib/auth-provider'
import { PageShell } from '@/components/page-shell'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldGrid } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tab, Tabs } from '@/components/ui/tabs'
import { ChurchImagePicker } from '@/components/church-image-picker'
import { days } from '@/components/church-site'
import { DraftReview } from '@/components/draft-review'

export function ChurchSettingsPage() {
  const { churchId } = useChurch()
  const { user } = useAuthState()
  const permissions =
    user?.memberships.find((membership) => membership.churchId === churchId)
      ?.permissions ?? []
  const allowed =
    permissions.includes('*') || permissions.includes('church.write')
  const query = useApiQuery<ChurchSettings>(
    allowed ? `/api/church-settings/${encodeURIComponent(churchId)}` : null,
  )
  if (!allowed)
    return (
      <PageShell>
        <PageHeader title="Church settings" />
        <p>Only church administrators can change these settings.</p>
      </PageShell>
    )
  if (!query.data)
    return (
      <PageShell>
        <PageHeader title="Church settings" />
        {query.error ? (
          <>
            <p role="alert">{query.error.message}</p>
            <Button onClick={() => void query.refetch()}>Try again</Button>
          </>
        ) : (
          <Skeleton className="h-96" />
        )}
      </PageShell>
    )
  return (
    <ChurchSettingsEditor
      key={churchId}
      churchId={churchId}
      initial={query.data}
    />
  )
}

export function ChurchSettingsEditor({
  churchId,
  initial,
}: {
  churchId: string
  initial: ChurchSettings
}) {
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial.draft)
  const [tab, setTab] = useState('church')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')
  const active = useRef(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.draft)
  const path = `/api/church-settings/${encodeURIComponent(churchId)}`
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    if (!busy && initial.version > saved.version) {
      setConflict(true)
      setError(
        dirty
          ? 'A newer draft is available. Your edits are still here.'
          : 'Draft updated. Reload to review.',
      )
    }
  }, [initial.version, saved.version, busy, dirty])
  useEffect(() => {
    if (!dirty) return
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', leave)
    const navigate = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest('a') : null
      if (
        anchor &&
        anchor.target !== '_blank' &&
        anchor.getAttribute('href')?.startsWith('/') &&
        !window.confirm('Leave without saving your changes?')
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', navigate, true)
    return () => {
      window.removeEventListener('beforeunload', leave)
      document.removeEventListener('click', navigate, true)
    }
  }, [dirty])
  function change<K extends keyof ChurchDraft>(key: K, value: ChurchDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setNotice('')
  }
  async function mutate(action: 'save' | 'publish' | 'unpublish' | 'restore') {
    if (busy || conflict) return
    if (
      action === 'restore' &&
      !window.confirm(
        'Restore the previous saved draft? The live website will stay unchanged.',
      )
    )
      return
    if (
      action === 'publish' &&
      !window.confirm('Publish this page and its selected images?')
    )
      return
    if (
      action === 'unpublish' &&
      !window.confirm(
        'Take the church website offline? Your content will be kept.',
      )
    )
      return
    setBusy(action)
    setError(null)
    setNotice('')
    try {
      const next = await apiRequest<ChurchSettings>(`${path}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          version: saved.version,
          ...(action === 'save' ? { draft } : {}),
        }),
      })
      if (!active.current) return
      setSaved(next)
      setDraft(next.draft)
      setConflict(false)
      setNotice(
        action === 'save'
          ? 'Draft saved'
          : action === 'restore'
            ? 'Previous draft restored'
            : action === 'publish'
              ? 'Website published'
              : 'Website unpublished',
      )
      window.dispatchEvent(new CustomEvent('f42:invalidate'))
    } catch (reason) {
      if (!active.current) return
      setConflict(reason instanceof ApiError && reason.status === 409)
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Unable to save. Try again.',
      )
    } finally {
      if (active.current) setBusy(null)
    }
  }
  async function reload() {
    if (
      dirty &&
      !window.confirm('Replace your changes with the latest saved draft?')
    )
      return
    setBusy('reload')
    try {
      const next = await apiRequest<ChurchSettings>(path)
      if (active.current) {
        setSaved(next)
        setDraft(next.draft)
        setConflict(false)
        setError(null)
      }
    } catch {
      if (active.current)
        setError('Unable to reload. Your changes are still here.')
    } finally {
      if (active.current) setBusy(null)
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const checked = churchDraftSchema.safeParse(draft)
    if (!checked.success) {
      const issue = checked.error.issues[0]
      setTab(
        issue.path[0] === 'serviceTimes' || issue.path[0] === 'timezone'
          ? 'gatherings'
          : 'church',
      )
      const labels: Partial<Record<keyof ChurchDraft, string>> = {
        name: 'Church name',
        tagline: 'Welcome line',
        summary: 'About',
        timezone: 'Timezone',
        serviceTimes: 'Gatherings',
        countryCode: 'Country code',
        postalCode: 'Postal code',
        websiteUrl: 'Website',
        givingUrl: 'Giving link',
        livestreamUrl: 'Livestream',
        email: 'Email',
        phone: 'Phone',
        street: 'Street',
        city: 'City',
        region: 'State / region',
      }
      setError(
        `${labels[issue.path[0] as keyof ChurchDraft] ?? 'Church settings'}: ${issue.message}`,
      )
      return
    }
    void mutate('save')
  }
  const input = (
    key: Exclude<
      keyof ChurchDraft,
      'serviceTimes' | 'logoMediaId' | 'coverMediaId' | 'themePreset'
    >,
    label: string,
    options: { type?: string; required?: boolean; maxLength?: number } = {},
  ) => (
    <Field label={label} required={options.required}>
      <Input
        name={key}
        value={draft[key]}
        onChange={(event) => change(key, event.target.value)}
        {...options}
      />
    </Field>
  )
  const completed = [
    saved.readiness.profile,
    saved.readiness.services,
    saved.readiness.content,
    saved.published,
  ].filter(Boolean).length
  return (
    <PageShell width="narrow">
      <PageHeader
        title="Church settings"
        actions={
          <>
            <Button asChild size="sm" variant="secondary">
              <Link to="/app/preview" target="_blank">
                <Eye aria-hidden />
                Preview
              </Link>
            </Button>
            {saved.published && (
              <Button
                asChild
                size="icon-sm"
                variant="ghost"
                aria-label="Open public website"
              >
                <a href="/" target="_blank" rel="noreferrer">
                  <ExternalLink />
                </a>
              </Button>
            )}
          </>
        }
      />
      <DraftReview
        churchId={churchId}
        settings={saved}
        disabled={busy !== null || dirty || conflict}
        restore={() => void mutate('restore')}
      />
      {!saved.published && (
        <div
          className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border p-4 text-sm"
          aria-label="Setup progress"
        >
          <span className="text-muted-foreground">{completed}/4</span>
          {[
            {
              label: 'Church details',
              done: saved.readiness.profile,
              action: () => setTab('church'),
            },
            {
              label: 'Gatherings',
              done: saved.readiness.services,
              action: () => setTab('gatherings'),
            },
          ].map((step) => (
            <button
              key={step.label}
              type="button"
              onClick={step.action}
              className="flex items-center gap-2"
            >
              {step.done ? (
                <CheckCircle2 aria-hidden className="size-4 text-brand-text" />
              ) : (
                <Circle aria-hidden className="size-4 text-muted-foreground" />
              )}
              {step.label}
            </button>
          ))}
          <Link to="/app/groups" className="flex items-center gap-2">
            {saved.readiness.content ? (
              <CheckCircle2 aria-hidden className="size-4 text-brand-text" />
            ) : (
              <Circle aria-hidden className="size-4 text-muted-foreground" />
            )}
            First content
          </Link>
          <span className="flex items-center gap-2 text-muted-foreground">
            <Globe aria-hidden className="size-4" />
            Publish
          </span>
        </div>
      )}
      <Tabs
        label="Church settings"
        value={tab}
        onValueChange={setTab}
        className="mb-6"
      >
        <Tab
          value="church"
          id="settings-tab-church"
          aria-controls="settings-panel-church"
        >
          Church
        </Tab>
        <Tab
          value="gatherings"
          id="settings-tab-gatherings"
          aria-controls="settings-panel-gatherings"
        >
          Gatherings
        </Tab>
        <Tab
          value="appearance"
          id="settings-tab-appearance"
          aria-controls="settings-panel-appearance"
        >
          Appearance
        </Tab>
      </Tabs>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={busy !== null} className="min-w-0">
          <div
            hidden={tab !== 'church'}
            role="tabpanel"
            id="settings-panel-church"
            aria-labelledby="settings-tab-church"
          >
            <Card>
              <div className="grid gap-5">
                {input('name', 'Church name', {
                  required: true,
                  maxLength: 120,
                })}
                {input('tagline', 'Welcome line', { maxLength: 160 })}
                <Field label="About">
                  <Textarea
                    name="summary"
                    rows={4}
                    maxLength={4000}
                    value={draft.summary}
                    onChange={(event) => change('summary', event.target.value)}
                  />
                </Field>
                <FieldGrid>
                  {input('email', 'Email', { type: 'email' })}
                  {input('phone', 'Phone', { type: 'tel', maxLength: 60 })}
                </FieldGrid>
                {input('street', 'Street', { maxLength: 240 })}
                <FieldGrid>
                  {input('city', 'City', { maxLength: 120 })}
                  {input('region', 'State / region', { maxLength: 120 })}
                  {input('postalCode', 'Postal code', { maxLength: 30 })}
                  <Field label="Country code">
                    <Input
                      name="countryCode"
                      value={draft.countryCode}
                      pattern="[A-Z]{2}"
                      maxLength={2}
                      required
                      onChange={(event) =>
                        change('countryCode', event.target.value.toUpperCase())
                      }
                    />
                  </Field>
                </FieldGrid>
                <details className="border-t border-border pt-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Website & links
                  </summary>
                  <div className="mt-4 grid gap-4">
                    {input('websiteUrl', 'Website', { type: 'url' })}
                    {input('givingUrl', 'Giving link', { type: 'url' })}
                    {input('livestreamUrl', 'Livestream', { type: 'url' })}
                  </div>
                </details>
              </div>
            </Card>
          </div>
          <div
            hidden={tab !== 'gatherings'}
            role="tabpanel"
            id="settings-panel-gatherings"
            aria-labelledby="settings-tab-gatherings"
          >
            <Card>
              <div className="mb-6 max-w-sm">
                {input('timezone', 'Timezone', {
                  required: true,
                  maxLength: 64,
                })}
              </div>
              <div className="space-y-4">
                {draft.serviceTimes.map((service, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_auto] items-end gap-3 border-b border-border pb-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
                  >
                    <Field label="Gathering">
                      <Input
                        aria-label={`Gathering ${index + 1} name`}
                        value={service.label}
                        maxLength={80}
                        required
                        onChange={(event) =>
                          change(
                            'serviceTimes',
                            draft.serviceTimes.map((entry, item) =>
                              item === index
                                ? { ...entry, label: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Day">
                      <Select
                        aria-label={`Gathering ${index + 1} day`}
                        value={service.day}
                        onChange={(event) =>
                          change(
                            'serviceTimes',
                            draft.serviceTimes.map((entry, item) =>
                              item === index
                                ? { ...entry, day: Number(event.target.value) }
                                : entry,
                            ),
                          )
                        }
                      >
                        {days.map((day, value) => (
                          <option key={day} value={value}>
                            {day}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Time">
                      <Input
                        type="time"
                        aria-label={`Gathering ${index + 1} time`}
                        value={service.time}
                        required
                        onChange={(event) =>
                          change(
                            'serviceTimes',
                            draft.serviceTimes.map((entry, item) =>
                              item === index
                                ? { ...entry, time: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Button
                      aria-label={`Remove gathering ${index + 1}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() =>
                        change(
                          'serviceTimes',
                          draft.serviceTimes.filter(
                            (_, item) => item !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                className="mt-4"
                size="sm"
                variant="secondary"
                disabled={draft.serviceTimes.length >= 20}
                onClick={() =>
                  change('serviceTimes', [
                    ...draft.serviceTimes,
                    { label: 'Sunday service', day: 0, time: '10:00' },
                  ])
                }
              >
                <Plus aria-hidden />
                Add gathering
              </Button>
            </Card>
          </div>
          <div
            hidden={tab !== 'appearance'}
            role="tabpanel"
            id="settings-panel-appearance"
            aria-labelledby="settings-tab-appearance"
          >
            <Card>
              <div className="grid grid-cols-2 gap-5">
                <ChurchImagePicker
                  churchId={churchId}
                  label="Logo"
                  value={draft.logoMediaId}
                  onChange={(id) => change('logoMediaId', id)}
                  disabled={busy !== null}
                />
                <ChurchImagePicker
                  churchId={churchId}
                  label="Cover image"
                  value={draft.coverMediaId}
                  onChange={(id) => change('coverMediaId', id)}
                  disabled={busy !== null}
                />
              </div>
              <h2 className="mb-3 mt-7 text-sm font-medium">Style</h2>
              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                role="group"
                aria-label="Church style"
              >
                {presetNames.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={draft.themePreset === preset}
                    onClick={() => change('themePreset', preset)}
                    className={`flex items-center gap-2 rounded-md border p-3 text-sm capitalize ${draft.themePreset === preset ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <span
                      aria-hidden
                      className="size-5 rounded-full"
                      style={{ background: presets[preset].accent }}
                    />
                    {preset}
                    {draft.themePreset === preset && (
                      <Check aria-hidden className="ml-auto size-3" />
                    )}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </fieldset>
        {error && (
          <div className="mt-4 text-sm text-destructive" role="alert">
            {error}
            {conflict && (
              <Button
                className="ml-2"
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void reload()}
              >
                Reload saved draft
              </Button>
            )}
          </div>
        )}
        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-4">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              type="submit"
              disabled={busy !== null || !dirty || conflict}
            >
              <Save aria-hidden />
              {busy === 'save' ? 'Saving…' : 'Save draft'}
            </Button>
            <span
              role="status"
              aria-live="polite"
              className="text-xs text-muted-foreground"
            >
              {notice ||
                (dirty
                  ? 'Unsaved changes'
                  : saved.hasDraft
                    ? 'Unpublished changes'
                    : saved.published
                      ? 'Live'
                      : 'Draft')}
            </span>
          </div>
          <div className="flex gap-2">
            {saved.published && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null || dirty || conflict}
                onClick={() => void mutate('unpublish')}
              >
                Unpublish
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={
                busy !== null ||
                dirty ||
                conflict ||
                !saved.readiness.profile ||
                (saved.published && !saved.hasDraft)
              }
              onClick={() => void mutate('publish')}
            >
              <Globe aria-hidden />
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </div>
      </form>
    </PageShell>
  )
}
