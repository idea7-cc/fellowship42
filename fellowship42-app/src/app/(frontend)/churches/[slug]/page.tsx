import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'

import { formatEventDate } from '@/lib/formatters'
import { getChurchSiteData } from '@/lib/public-site'

type Args = {
  params: Promise<{
    slug: string
  }>
}

export const dynamic = 'force-dynamic'

export const generateMetadata = async ({ params }: Args): Promise<Metadata> => {
  const { slug } = await params
  const site = await getChurchSiteData(slug)

  if (!site) {
    return {
      title: 'Church not found | Fellowship42',
    }
  }

  return {
    description: site.church.summary,
    title: `${site.church.name} | Fellowship42`,
  }
}

export default async function ChurchPage({ params }: Args) {
  const { slug } = await params
  const site = await getChurchSiteData(slug)

  if (!site) {
    notFound()
  }

  const { church, ministries, groups, courses, events, sermons } = site
  const accent = church.theme?.accent || '#b85c38'
  const surface = church.theme?.surface || '#f4ede3'
  const ink = church.theme?.ink || '#1d120c'

  return (
    <div
      className="church-site"
      style={
        {
          ['--church-accent' as string]: accent,
          ['--church-surface' as string]: surface,
          ['--church-ink' as string]: ink,
        } as CSSProperties
      }
    >
      <section className="church-hero">
        <div className="eyebrow">Church website preview</div>
        <h1>{church.name}</h1>
        <p className="lede">{church.tagline}</p>
        <p>{church.summary}</p>
        <div className="hero-actions">
          {church.givingUrl ? (
            <a className="button primary" href={church.givingUrl} rel="noreferrer" target="_blank">
              Give online
            </a>
          ) : (
            <Link className="button primary" href="/admin">
              Configure giving
            </Link>
          )}
          <Link className="button secondary" href="/">
            Back to platform
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Plan your visit</h2>
          <p>
            {church.address?.street}, {church.address?.city}, {church.address?.state}{' '}
            {church.address?.postalCode}
          </p>
        </div>
        <div className="card-grid">
          {church.serviceTimes?.map((service, index) => (
            <article className="feature-card" key={`${service.day}-${service.time}-${index}`}>
              <h3>{service.label}</h3>
              <p>{service.day}</p>
              <p>{service.time}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Featured ministries</h2>
          <p>Use Payload to keep ministry pages and schedules current for attenders and volunteers.</p>
        </div>
        <div className="card-grid">
          {ministries.map((ministry) => (
            <article className="feature-card" key={ministry.id}>
              <span className="kicker">{ministry.audience}</span>
              <h3>{ministry.title}</h3>
              <p>{ministry.summary}</p>
              <p className="muted">{ministry.schedule}</p>
              <Link className="inline-link" href={`/churches/${church.slug}/ministries/${ministry.slug}`}>
                Open landing page
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Groups and classes</h2>
          <p>
            Ministries are the umbrella. Groups are the recurring gatherings people actually join:
            Sunday school, small groups, Bible studies, and training cohorts.
          </p>
        </div>
        <div className="card-grid">
          {groups.map((group) => (
            <article className="feature-card" key={group.id}>
              <span className="kicker">{group.groupType.replace('-', ' ')}</span>
              <h3>{group.title}</h3>
              <p>{group.summary}</p>
              <p className="muted">
                {group.schedule}
                {group.location ? ` · ${group.location}` : ''}
              </p>
              <Link className="inline-link" href={`/churches/${church.slug}/groups/${group.slug}`}>
                Open landing page
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Courses and training</h2>
          <p>
            Structured training works for new-member pathways, volunteer readiness, and curriculum-based
            discipleship.
          </p>
        </div>
        <div className="card-grid">
          {courses.map((course) => (
            <article className="feature-card" key={course.id}>
              <span className="kicker">{course.deliveryMode.replace('-', ' ')}</span>
              <h3>{course.title}</h3>
              <p>{course.summary}</p>
              <p className="muted">
                {course.duration} · {course.audience}
              </p>
              <p className="muted">{course.lessons?.length ?? 0} lessons</p>
              <Link className="inline-link" href={`/churches/${church.slug}/courses/${course.slug}`}>
                Open landing page
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Upcoming events</h2>
          <p>The same data model can power public promotion and internal operations.</p>
        </div>
        <div className="card-grid">
          {events.map((event) => (
            <article className="feature-card" key={event.id}>
              <span className="kicker">{formatEventDate(event.startDate)}</span>
              <h3>{event.title}</h3>
              <p>{event.summary}</p>
              <p className="muted">{event.location}</p>
              {event.registrationUrl && (
                <a className="inline-link" href={event.registrationUrl} rel="noreferrer" target="_blank">
                  Register
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Latest sermons</h2>
          <p>Payload is also serving the publishing side of the product, not just the admin data.</p>
        </div>
        <div className="card-grid">
          {sermons.map((sermon) => (
            <article className="feature-card" key={sermon.id}>
              <span className="kicker">{sermon.series || 'Recent message'}</span>
              <h3>{sermon.title}</h3>
              <p>{sermon.summary}</p>
              <p className="muted">
                {sermon.speaker} · {formatEventDate(sermon.preachedAt)}
              </p>
              {sermon.videoUrl && (
                <a className="inline-link" href={sermon.videoUrl} rel="noreferrer" target="_blank">
                  Watch sermon
                </a>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
