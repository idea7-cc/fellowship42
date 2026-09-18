import { Bot, Undo2, UserRound } from 'lucide-react'
import type {
  ChurchDraft,
  ChurchSettings,
} from '../../contracts/church-settings'
import { Button } from './ui/button'

const labels: Record<keyof ChurchDraft, string> = {
  name: 'Church name',
  tagline: 'Welcome line',
  summary: 'About',
  timezone: 'Timezone',
  street: 'Street',
  city: 'City',
  region: 'State / region',
  postalCode: 'Postal code',
  countryCode: 'Country',
  phone: 'Phone',
  email: 'Email',
  websiteUrl: 'Website',
  givingUrl: 'Giving',
  livestreamUrl: 'Livestream',
  themePreset: 'Appearance',
  logoMediaId: 'Logo',
  coverMediaId: 'Cover image',
  serviceTimes: 'Gatherings',
}
function display(key: keyof ChurchDraft, draft: ChurchDraft) {
  const value = draft[key]
  if (key === 'logoMediaId' || key === 'coverMediaId')
    return value ? 'Image selected' : 'No image'
  if (Array.isArray(value))
    return (
      value
        .map(
          (time) =>
            `${time.label} · ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][time.day]} ${time.time}`,
        )
        .join('\n') || 'None'
    )
  return value || '—'
}
export function DraftReview({
  settings,
  churchId,
  disabled,
  restore,
}: {
  settings: ChurchSettings
  churchId: string
  disabled: boolean
  restore: () => void
}) {
  const { review, draft } = settings
  const changes = (Object.keys(labels) as Array<keyof ChurchDraft>).filter(
    (key) =>
      JSON.stringify(draft[key]) !== JSON.stringify(review.baseline[key]),
  )
  const author = review.changedBy
  const value = (key: keyof ChurchDraft, content: ChurchDraft) => {
    if ((key === 'logoMediaId' || key === 'coverMediaId') && content[key])
      return (
        <img
          className="h-20 max-w-full rounded object-contain"
          alt={labels[key]}
          src={`/api/church-settings/${encodeURIComponent(churchId)}/images/${encodeURIComponent(content[key])}`}
        />
      )
    return display(key, content)
  }

  return (
    <div className="mb-5 space-y-3 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {author ? (
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
            {author.kind === 'agent' ? (
              <Bot className="size-4 shrink-0" aria-hidden />
            ) : (
              <UserRound className="size-4 shrink-0" aria-hidden />
            )}
            <span className="truncate" title={author.name}>
              Edited by{' '}
              {author.kind === 'agent' && (
                <span className="sr-only">agent </span>
              )}
              {author.name}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Saved draft</span>
        )}
        {review.canRestore && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={restore}
          >
            <Undo2 aria-hidden />
            Restore previous
          </Button>
        )}
      </div>
      {changes.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">
            Review changes ({changes.length})
          </summary>
          <dl className="mt-3 divide-y divide-border">
            {changes.map((key) => (
              <div key={key} className="py-3">
                <dt className="mb-1 font-medium">{labels[key]}</dt>
                <dd className="grid gap-2 break-words whitespace-pre-wrap sm:grid-cols-2">
                  <span>
                    <span className="sr-only">Previous: </span>
                    <del className="text-muted-foreground">
                      {value(key, review.baseline)}
                    </del>
                  </span>
                  <span>
                    <span className="sr-only">Draft: </span>
                    <ins className="no-underline">{value(key, draft)}</ins>
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  )
}
