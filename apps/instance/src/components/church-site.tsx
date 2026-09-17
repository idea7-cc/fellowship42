import {
  ArrowRight,
  CalendarDays,
  Clock,
  ExternalLink,
  MapPin,
  Mail,
  Phone,
  Play,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ChurchSite } from '../../contracts/church-settings'
import { ChurchTheme } from './church-theme'
import { Button } from './ui/button'
import { Card } from './ui/card'

export const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
export function serviceTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}
export function ChurchWebsite({
  site,
  preview = false,
}: {
  site: ChurchSite
  preview?: boolean
}) {
  const { church, groups, courses, events, sermons } = site
  const address = [
    church.address.street,
    church.address.city,
    church.address.state,
    church.address.postalCode,
  ]
    .filter(Boolean)
    .join(', ')
  const sections = [
    { id: 'events', label: 'Events', count: events.length },
    { id: 'groups', label: 'Groups', count: groups.length },
    { id: 'courses', label: 'Courses', count: courses.length },
    { id: 'sermons', label: 'Sermons', count: sermons.length },
  ].filter((section) => section.count > 0)
  const base = preview ? '/app/preview' : '/'
  return (
    <ChurchTheme
      scope="surface"
      theme={church.theme}
      className="min-h-screen bg-background text-foreground"
    >
      <a
        href="#church-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
      >
        Skip to content
      </a>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-5">
          <Link
            to={base}
            className="flex min-w-0 items-center gap-3 font-semibold"
          >
            {church.logoUrl ? (
              <img
                src={church.logoUrl}
                alt=""
                className="size-10 rounded-md object-contain"
              />
            ) : (
              <span aria-hidden className="size-3 rounded-full bg-primary" />
            )}
            <span>{church.name}</span>
          </Link>
          <nav
            aria-label="Church website"
            className="flex flex-wrap items-center gap-5 text-sm"
          >
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-muted-foreground hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
            {!preview && (
              <Button asChild size="sm" variant="ghost">
                <Link to="/app">
                  Sign in <ArrowRight aria-hidden />
                </Link>
              </Button>
            )}
          </nav>
        </header>
        <main id="church-content">
          <section className="grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-2">
            <div>
              <h1
                className="text-4xl leading-tight tracking-tight sm:text-5xl"
                style={{ fontFamily: 'var(--church-heading-font)' }}
              >
                {church.tagline || church.name}
              </h1>
              {church.summary && (
                <p className="mt-5 max-w-xl whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {church.summary}
                </p>
              )}
              <div className="mt-7 flex flex-wrap gap-3">
                {church.serviceTimes.length > 0 && (
                  <Button asChild>
                    <a href="#visit">
                      Join us <ArrowRight aria-hidden />
                    </a>
                  </Button>
                )}
                {church.livestreamUrl && (
                  <Button asChild variant="secondary">
                    <a
                      href={church.livestreamUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Play aria-hidden />
                      Watch live
                    </a>
                  </Button>
                )}
              </div>
            </div>
            {church.coverUrl ? (
              <img
                src={church.coverUrl}
                alt=""
                className="aspect-[4/3] w-full rounded-2xl object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-primary/5"
              >
                <svg
                  viewBox="0 0 320 240"
                  className="h-full w-full max-w-sm text-primary/25"
                  fill="none"
                >
                  <path
                    d="M65 225V120a95 95 0 0 1 190 0v105M95 225V120a65 65 0 0 1 130 0v105M125 225V120a35 35 0 0 1 70 0v105"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M40 225h240M160 38v40m-14-20h28"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            )}
          </section>
          {(church.serviceTimes.length > 0 ||
            address ||
            church.contact.email ||
            church.contact.phone) && (
            <section
              id="visit"
              aria-label="Visit us"
              className="grid scroll-mt-6 gap-8 border-y border-border py-8 sm:grid-cols-2"
            >
              {church.serviceTimes.length > 0 && (
                <div className="flex items-start gap-4">
                  <Clock
                    aria-hidden
                    className="mt-1 size-5 shrink-0 text-primary"
                  />
                  <div>
                    <h2 className="mb-3 text-lg">Gather with us</h2>
                    <ul className="space-y-3">
                      {church.serviceTimes.map((service) => (
                        <li key={service.id}>
                          <span className="font-medium">{service.label}</span>
                          <div className="text-sm text-muted-foreground">
                            {days[service.day]} · {serviceTime(service.time)}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {church.timezone.replaceAll('_', ' ')}
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                {address && (
                  <div className="flex gap-4">
                    <MapPin
                      aria-hidden
                      className="mt-1 size-5 shrink-0 text-primary"
                    />
                    <div>
                      <h2 className="mb-2 text-lg">Find us</h2>
                      <p className="text-sm text-muted-foreground">{address}</p>
                      <a
                        className="mt-2 inline-flex items-center gap-1 text-sm text-brand-text hover:underline"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Directions{' '}
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    </div>
                  </div>
                )}
                {church.contact.email && (
                  <a
                    className="flex items-center gap-4 text-sm"
                    href={`mailto:${church.contact.email}`}
                  >
                    <Mail aria-hidden className="size-5 text-primary" />
                    {church.contact.email}
                  </a>
                )}
                {church.contact.phone && (
                  <a
                    className="flex items-center gap-4 text-sm"
                    href={`tel:${church.contact.phone}`}
                  >
                    <Phone aria-hidden className="size-5 text-primary" />
                    {church.contact.phone}
                  </a>
                )}
              </div>
            </section>
          )}
          {events.length > 0 && (
            <section id="events" className="scroll-mt-6 py-10">
              <h2 className="mb-5 text-2xl">Coming up</h2>
              <div className="divide-y divide-border">
                {events.map((event) => (
                  <article
                    key={event.id}
                    className="flex items-start gap-5 py-5"
                  >
                    <CalendarDays
                      aria-hidden
                      className="mt-1 size-5 shrink-0 text-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold">{event.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: event.timezone,
                        }).format(event.startDate)}{' '}
                        · {event.timezone.replaceAll('_', ' ')}
                      </p>
                      {event.location && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.location}
                        </p>
                      )}
                      {event.summary && (
                        <p className="mt-2 text-sm">{event.summary}</p>
                      )}
                    </div>
                    {event.registrationUrl && (
                      <Button asChild size="sm" variant="secondary">
                        <a
                          href={event.registrationUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Register <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {groups.length > 0 && (
            <section id="groups" className="scroll-mt-6 py-10">
              <h2 className="mb-5 text-2xl">Find your people</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map((group) => (
                  <Card key={group.id}>
                    <UsersRound
                      aria-hidden
                      className="mb-4 size-5 text-primary"
                    />
                    <h3 className="text-base font-semibold">{group.title}</h3>
                    {group.schedule && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {group.schedule}
                      </p>
                    )}
                    {group.location && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {group.location}
                      </p>
                    )}
                    {group.summary && (
                      <p className="mt-3 text-sm leading-relaxed">
                        {group.summary}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )}
          {courses.length > 0 && (
            <section id="courses" className="scroll-mt-6 py-10">
              <h2 className="mb-5 text-2xl">Learn together</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                  <Card key={course.id}>
                    <h3 className="text-base font-semibold">{course.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {course.summary}
                    </p>
                    <Button asChild className="mt-4" size="sm" variant="ghost">
                      <Link
                        to={
                          preview
                            ? `/app/courses/${course.slug}`
                            : `/courses/${course.slug}`
                        }
                      >
                        View course <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          )}
          {sermons.length > 0 && (
            <section id="sermons" className="scroll-mt-6 py-10">
              <h2 className="mb-5 text-2xl">Recent messages</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {sermons.map((sermon) => (
                  <Card key={sermon.id}>
                    <h3 className="text-base font-semibold">{sermon.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {sermon.speaker}
                      {sermon.series ? ` · ${sermon.series}` : ''}
                    </p>
                    {sermon.summary && (
                      <p className="mt-3 text-sm">{sermon.summary}</p>
                    )}
                    {sermon.videoUrl && (
                      <Button
                        asChild
                        className="mt-4"
                        size="sm"
                        variant="secondary"
                      >
                        <a
                          href={sermon.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Play aria-hidden />
                          Watch
                        </a>
                      </Button>
                    )}
                    {sermon.audioMediaId && (
                      <audio
                        aria-label={`Listen to ${sermon.title}`}
                        controls
                        preload="none"
                        className="mt-4 w-full"
                        src={`/media/${encodeURIComponent(sermon.audioMediaId)}`}
                      />
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )}
        </main>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-border py-8 text-sm">
          <span>{church.name}</span>
          <div className="flex gap-5">
            {church.contact.website && (
              <a href={church.contact.website} rel="noreferrer" target="_blank">
                Website
              </a>
            )}
            {church.givingUrl && (
              <a href={church.givingUrl} rel="noreferrer" target="_blank">
                Give
              </a>
            )}
          </div>
        </footer>
      </div>
    </ChurchTheme>
  )
}
