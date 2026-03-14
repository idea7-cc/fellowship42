import Link from 'next/link'

export type LandingBlock = Record<string, unknown> & {
  blockType?: string
  id?: string | null
}

type BasicChurch = {
  givingUrl?: string | null
  slug: string
}

type Lesson = {
  estimatedMinutes?: number | null
  id?: string | null
  summary?: string | null
  title?: string | null
}

type BasicEntity = Record<string, unknown> & {
  audience?: string | null
  deliveryMode?: string | null
  duration?: string | null
  id: number | string
  lessons?: Lesson[] | null
  location?: string | null
  ministry?: number | string | { id?: number | string | null; slug?: string | null; title?: string | null } | null
  openEnrollment?: boolean | null
  schedule?: string | null
  slug?: string | null
  summary?: string | null
  title?: string | null
}

type RelatedGroup = Record<string, unknown> & {
  groupType?: string | null
  id: number | string
  slug?: string | null
  summary?: string | null
  title?: string | null
}

type RelatedCourse = Record<string, unknown> & {
  courseType?: string | null
  duration?: string | null
  id: number | string
  slug?: string | null
  summary?: string | null
  title?: string | null
}

type RelatedFeedItem = Record<string, unknown> & {
  id: number | string
  location?: string | null
  preachedAt?: string | null
  registrationUrl?: string | null
  schedule?: string | null
  slug?: string | null
  speaker?: string | null
  startDate?: string | null
  summary?: string | null
  title?: string | null
  videoUrl?: string | null
}

type LandingPageRendererProps = {
  blocks?: LandingBlock[] | null
  church: BasicChurch
  entity: BasicEntity
  pageType: 'ministry' | 'group' | 'course'
  relatedCourses?: RelatedCourse[]
  relatedGroups?: RelatedGroup[]
}

type PersonCard = {
  email?: string | null
  firstName?: string | null
  id?: number | string | null
  lastName?: string | null
  membershipStatus?: string | null
}

const readArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const personName = (person: PersonCard) => [person.firstName, person.lastName].filter(Boolean).join(' ')

const getFeedLink = ({
  churchSlug,
  feedType,
  item,
}: {
  churchSlug: string
  feedType: string
  item: RelatedFeedItem
}) => {
  if (feedType === 'groups' && item.slug) {
    return `/churches/${churchSlug}/groups/${item.slug}`
  }

  if (feedType === 'courses' && item.slug) {
    return `/churches/${churchSlug}/courses/${item.slug}`
  }

  if (feedType === 'events') {
    return item.registrationUrl ? String(item.registrationUrl) : null
  }

  if (feedType === 'sermons') {
    return item.videoUrl ? String(item.videoUrl) : null
  }

  return null
}

const renderBlock = ({
  block,
  church,
  index,
}: {
  block: LandingBlock
  church: BasicChurch
  index: number
}) => {
  switch (block.blockType) {
    case 'hero':
      return (
        <section className="landing-hero landing-block" key={block.id || `hero-${index}`}>
          {block.eyebrow ? <div className="eyebrow">{String(block.eyebrow)}</div> : null}
          <h1>{String(block.headline || '')}</h1>
          {block.body ? <p className="lede">{String(block.body)}</p> : null}
          <div className="hero-actions">
            {block.primaryLabel && block.primaryHref ? (
              <a className="button primary" href={String(block.primaryHref)}>
                {String(block.primaryLabel)}
              </a>
            ) : null}
            {block.secondaryLabel && block.secondaryHref ? (
              <a className="button secondary" href={String(block.secondaryHref)}>
                {String(block.secondaryLabel)}
              </a>
            ) : null}
          </div>
        </section>
      )
    case 'copy':
      return (
        <section className="section landing-block" key={block.id || `copy-${index}`}>
          <div className="section-heading">
            <h2>{String(block.title || '')}</h2>
            <p>{String(block.body || '')}</p>
          </div>
        </section>
      )
    case 'featureList':
      return (
        <section className="section landing-block" key={block.id || `feature-${index}`}>
          <div className="section-heading">
            <h2>{String(block.title || '')}</h2>
            {block.intro ? <p>{String(block.intro)}</p> : null}
          </div>
          <div className="card-grid">
            {readArray<{ body: string; title: string }>(block.items).map((item, itemIndex: number) => (
              <article className="feature-card" key={`${block.id || index}-${itemIndex}`}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      )
    case 'cta':
      return (
        <section className="section landing-block" key={block.id || `cta-${index}`}>
          <article className="feature-card cta-card">
            <h2>{String(block.title || '')}</h2>
            {block.body ? <p>{String(block.body)}</p> : null}
            <a className="button primary" href={String(block.href || '#')}>
              {String(block.label || 'Learn more')}
            </a>
          </article>
        </section>
      )
    case 'faq':
      return (
        <section className="section landing-block" key={block.id || `faq-${index}`}>
          <div className="section-heading">
            <h2>{String(block.title || '')}</h2>
          </div>
          <div className="card-grid">
            {readArray<{ answer: string; question: string }>(block.questions).map((item, itemIndex: number) => (
              <article className="feature-card" key={`${block.id || index}-${itemIndex}`}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>
      )
    case 'testimonials':
      return (
        <section className="section landing-block" key={block.id || `testimonials-${index}`}>
          <div className="section-heading">
            <h2>{String(block.title || '')}</h2>
            {block.intro ? <p>{String(block.intro)}</p> : null}
          </div>
          <div className="card-grid">
            {readArray<{ name: string; quote: string; role?: string }>(block.items).map((item, itemIndex: number) => (
              <article className="feature-card quote-card" key={`${block.id || index}-${itemIndex}`}>
                <p className="quote-card__quote">&ldquo;{item.quote}&rdquo;</p>
                <div className="mini-stack">
                  <strong>{item.name}</strong>
                  {item.role ? <span className="muted">{item.role}</span> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      )
    case 'leaderCards':
      return (
        <section className="section landing-block" key={block.id || `leaders-${index}`}>
          <div className="section-heading">
            <h2>{String(block.title || '')}</h2>
            {block.intro ? <p>{String(block.intro)}</p> : null}
          </div>
          <div className="card-grid">
            {readArray<PersonCard>(block.leaders).map((person, itemIndex: number) => (
              <article className="feature-card" key={`${block.id || index}-${itemIndex}`}>
                <span className="kicker">{String(person.membershipStatus || 'leader').replace('-', ' ')}</span>
                <h3>{personName(person) || 'Leader'}</h3>
                {person.email ? <p>{person.email}</p> : <p>Connect with a ministry leader through the church office.</p>}
              </article>
            ))}
          </div>
        </section>
      )
    case 'signupForm':
      return (
        <section className="section landing-block" key={block.id || `signup-${index}`}>
          <article className="feature-card cta-card signup-card">
            <span className="kicker">{String(block.formType || 'next step').replace('-', ' ')}</span>
            <h2>{String(block.title || '')}</h2>
            {block.body ? <p>{String(block.body)}</p> : null}
            <div className="hero-actions">
              {block.buttonLabel && block.buttonHref ? (
                <a className="button primary" href={String(block.buttonHref)}>
                  {String(block.buttonLabel)}
                </a>
              ) : null}
              {block.emailDestination ? (
                <a className="button secondary" href={`mailto:${String(block.emailDestination)}`}>
                  Email the team
                </a>
              ) : null}
            </div>
            {block.helperText ? <p className="muted">{String(block.helperText)}</p> : null}
          </article>
        </section>
      )
    case 'relatedFeed': {
      const feedType = String(block.feedType || '')
      const items = readArray<RelatedFeedItem>(block.resolvedItems)

      if (!items.length) {
        return null
      }

      return (
        <section className="section landing-block" key={block.id || `feed-${index}`}>
          <div className="section-heading">
            <h2>{String(block.title || 'Related content')}</h2>
            {block.intro ? <p>{String(block.intro)}</p> : null}
          </div>
          <div className="card-grid">
            {items.map((item, itemIndex: number) => {
              const href = getFeedLink({
                churchSlug: church.slug,
                feedType,
                item,
              })

              return (
                <article className="feature-card" key={`${block.id || index}-${item.id || itemIndex}`}>
                  <span className="kicker">{feedType.replace('-', ' ')}</span>
                  <h3>{String(item.title || 'Untitled')}</h3>
                  {item.summary ? <p>{String(item.summary)}</p> : null}
                  {item.startDate ? <p className="muted">{new Date(String(item.startDate)).toLocaleDateString()}</p> : null}
                  {item.preachedAt ? <p className="muted">{new Date(String(item.preachedAt)).toLocaleDateString()}</p> : null}
                  {item.location ? <p className="muted">{String(item.location)}</p> : null}
                  {item.speaker ? <p className="muted">{String(item.speaker)}</p> : null}
                  {href ? (
                    <a className="inline-link" href={href}>
                      Open {feedType === 'events' ? 'registration' : feedType === 'sermons' ? 'message' : 'page'}
                    </a>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>
      )
    }
    default:
      return null
  }
}

export function LandingPageRenderer({
  blocks,
  church,
  entity,
  pageType,
  relatedCourses = [],
  relatedGroups = [],
}: LandingPageRendererProps) {
  const entityLabel =
    pageType === 'ministry' ? 'Ministry landing page' : pageType === 'group' ? 'Group landing page' : 'Course landing page'

  const hasCustomBlocks = Boolean(blocks?.length)

  return (
    <div className="landing-shell">
      {hasCustomBlocks ? (
        blocks?.map((block, index) =>
          renderBlock({
            block,
            church,
            index,
          }),
        )
      ) : (
        <section className="landing-hero">
          <div className="eyebrow">{entityLabel}</div>
          <h1>{String(entity.title || '')}</h1>
          <p className="lede">{String(entity.summary || '')}</p>
          <div className="hero-actions">
            {church.givingUrl ? (
              <a className="button primary" href={church.givingUrl}>
                Give online
              </a>
            ) : null}
            <Link className="button secondary" href={`/churches/${church.slug}`}>
              Back to church
            </Link>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-heading">
          <h2>Quick details</h2>
          <p>These default sections always inherit the church theme unless the page has scoped overrides.</p>
        </div>
        <div className="card-grid">
          {pageType === 'ministry' ? (
            <>
              <article className="feature-card">
                <h3>Audience</h3>
                <p>{String(entity.audience || '')}</p>
              </article>
              <article className="feature-card">
                <h3>Schedule</h3>
                <p>{String(entity.schedule || '')}</p>
              </article>
              <article className="feature-card">
                <h3>Overview</h3>
                <p>{String(entity.summary || '')}</p>
              </article>
            </>
          ) : null}

          {pageType === 'group' ? (
            <>
              <article className="feature-card">
                <h3>Schedule</h3>
                <p>{String(entity.schedule || '')}</p>
              </article>
              <article className="feature-card">
                <h3>Location</h3>
                <p>{entity.location || 'Location shared after signup'}</p>
              </article>
              <article className="feature-card">
                <h3>Enrollment</h3>
                <p>{entity.openEnrollment ? 'Open now' : 'Request to join'}</p>
              </article>
            </>
          ) : null}

          {pageType === 'course' ? (
            <>
              <article className="feature-card">
                <h3>Duration</h3>
                <p>{String(entity.duration || '')}</p>
              </article>
              <article className="feature-card">
                <h3>Format</h3>
                <p>{String(entity.deliveryMode || '').replace('-', ' ')}</p>
              </article>
              <article className="feature-card">
                <h3>Audience</h3>
                <p>{String(entity.audience || '')}</p>
              </article>
            </>
          ) : null}
        </div>
      </section>

      {pageType === 'ministry' && relatedGroups.length ? (
        <section className="section">
          <div className="section-heading">
            <h2>Related groups</h2>
            <p>Groups inherit church branding by default, with optional landing-page customization.</p>
          </div>
          <div className="card-grid">
            {relatedGroups.map((group) => (
              <article className="feature-card" key={group.id}>
                <span className="kicker">{String(group.groupType || '').replace('-', ' ')}</span>
                <h3>{String(group.title || '')}</h3>
                <p>{String(group.summary || '')}</p>
                <Link className="inline-link" href={`/churches/${church.slug}/groups/${group.slug || ''}`}>
                  Open group page
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {pageType !== 'course' && relatedCourses.length ? (
        <section className="section">
          <div className="section-heading">
            <h2>Related courses</h2>
            <p>Use courses for volunteer training, member onboarding, and curriculum-based discipleship.</p>
          </div>
          <div className="card-grid">
            {relatedCourses.map((course) => (
              <article className="feature-card" key={course.id}>
                <span className="kicker">{String(course.courseType || '').replace('-', ' ')}</span>
                <h3>{String(course.title || '')}</h3>
                <p>{String(course.summary || '')}</p>
                <p className="muted">{String(course.duration || '')}</p>
                <Link className="inline-link" href={`/churches/${church.slug}/courses/${course.slug || ''}`}>
                  Open course page
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {pageType === 'course' && entity.lessons?.length ? (
        <section className="section">
          <div className="section-heading">
            <h2>Course outline</h2>
            <p>Landing pages can add editorial content while the structured lesson list stays synchronized.</p>
          </div>
          <div className="card-grid">
            {entity.lessons.map((lesson, index: number) => (
              <article className="feature-card" key={lesson.id || `${entity.id}-${index}`}>
                <span className="kicker">{lesson.estimatedMinutes || 15} minutes</span>
                <h3>{String(lesson.title || '')}</h3>
                <p>{String(lesson.summary || '')}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
