import type { CSSProperties } from 'react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { CardGrid } from '@/components/card-grid'
import { Eyebrow } from '@/components/eyebrow'
import { Hero, HeroActions } from '@/components/hero'
import { Section } from '@/components/section'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

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
  ministry?:
    | number
    | string
    | { id?: number | string | null; slug?: string | null; title?: string | null }
    | null
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

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const readArray = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : []

const personName = (person: PersonCard) =>
  [person.firstName, person.lastName].filter(Boolean).join(' ')

const getFeedLink = ({
  churchSlug,
  feedType,
  item,
}: {
  churchSlug: string
  feedType: string
  item: RelatedFeedItem
}) => {
  if (feedType === 'groups' && item.slug) return `/churches/${churchSlug}/groups/${item.slug}`
  if (feedType === 'courses' && item.slug) return `/churches/${churchSlug}/courses/${item.slug}`
  if (feedType === 'events') return item.registrationUrl ? String(item.registrationUrl) : null
  if (feedType === 'sermons') return item.videoUrl ? String(item.videoUrl) : null
  return null
}

/** Cards inside a landing page use a slightly lighter church surface */
const landingCardStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--card) 82%, white 18%)',
}

/** Signup card uses a subtle accent gradient */
const signupCardStyle: CSSProperties = {
  background:
    'linear-gradient(145deg, color-mix(in srgb, var(--primary) 8%, white 92%), color-mix(in srgb, var(--card) 88%, white 12%))',
}

/* ------------------------------------------------------------------ */
/* Block renderer                                                      */
/* ------------------------------------------------------------------ */

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
        <div className={index > 0 ? 'mt-8' : ''} key={block.id || `hero-${index}`}>
          <Hero variant="landing">
            {block.eyebrow ? <Eyebrow>{String(block.eyebrow)}</Eyebrow> : null}
            <h1>{String(block.headline || '')}</h1>
            {block.body ? (
              <p className="mt-4 max-w-[52rem] text-lg">{String(block.body)}</p>
            ) : null}
            <HeroActions>
              {block.primaryLabel && block.primaryHref ? (
                <Button asChild>
                  <a href={String(block.primaryHref)}>{String(block.primaryLabel)}</a>
                </Button>
              ) : null}
              {block.secondaryLabel && block.secondaryHref ? (
                <Button asChild variant="secondary">
                  <a href={String(block.secondaryHref)}>{String(block.secondaryLabel)}</a>
                </Button>
              ) : null}
            </HeroActions>
          </Hero>
        </div>
      )

    case 'copy':
      return (
        <Section
          className={index > 0 ? 'mt-8' : ''}
          description={String(block.body || '')}
          key={block.id || `copy-${index}`}
          title={String(block.title || '')}
        />
      )

    case 'featureList':
      return (
        <Section
          className={index > 0 ? 'mt-8' : ''}
          description={block.intro ? String(block.intro) : undefined}
          key={block.id || `feature-${index}`}
          title={String(block.title || '')}
        >
          <CardGrid>
            {readArray<{ body: string; title: string }>(block.items).map(
              (item, itemIndex: number) => (
                <Card key={`${block.id || index}-${itemIndex}`} style={landingCardStyle}>
                  <CardHeader>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{item.body}</CardDescription>
                  </CardContent>
                </Card>
              ),
            )}
          </CardGrid>
        </Section>
      )

    case 'cta':
      return (
        <Section className={index > 0 ? 'mt-8' : ''} key={block.id || `cta-${index}`}>
          <Card className="items-start" style={landingCardStyle}>
            <CardHeader>
              <h2>{String(block.title || '')}</h2>
            </CardHeader>
            <CardContent>
              {block.body ? <CardDescription>{String(block.body)}</CardDescription> : null}
            </CardContent>
            <CardFooter>
              <Button asChild>
                <a href={String(block.href || '#')}>{String(block.label || 'Learn more')}</a>
              </Button>
            </CardFooter>
          </Card>
        </Section>
      )

    case 'faq':
      return (
        <Section
          className={index > 0 ? 'mt-8' : ''}
          key={block.id || `faq-${index}`}
          title={String(block.title || '')}
        >
          <CardGrid>
            {readArray<{ answer: string; question: string }>(block.questions).map(
              (item, itemIndex: number) => (
                <Card key={`${block.id || index}-${itemIndex}`} style={landingCardStyle}>
                  <CardHeader>
                    <CardTitle>{item.question}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{item.answer}</CardDescription>
                  </CardContent>
                </Card>
              ),
            )}
          </CardGrid>
        </Section>
      )

    case 'testimonials':
      return (
        <Section
          className={index > 0 ? 'mt-8' : ''}
          description={block.intro ? String(block.intro) : undefined}
          key={block.id || `testimonials-${index}`}
          title={String(block.title || '')}
        >
          <CardGrid>
            {readArray<{ name: string; quote: string; role?: string }>(block.items).map(
              (item, itemIndex: number) => (
                <Card key={`${block.id || index}-${itemIndex}`} style={landingCardStyle}>
                  <CardContent>
                    <p className="text-base text-foreground">&ldquo;{item.quote}&rdquo;</p>
                    <div className="grid gap-1">
                      <strong className="text-sm">{item.name}</strong>
                      {item.role ? (
                        <span className="text-sm text-muted-foreground">{item.role}</span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ),
            )}
          </CardGrid>
        </Section>
      )

    case 'leaderCards':
      return (
        <Section
          className={index > 0 ? 'mt-8' : ''}
          description={block.intro ? String(block.intro) : undefined}
          key={block.id || `leaders-${index}`}
          title={String(block.title || '')}
        >
          <CardGrid>
            {readArray<PersonCard>(block.leaders).map((person, itemIndex: number) => (
              <Card key={`${block.id || index}-${itemIndex}`} style={landingCardStyle}>
                <CardHeader>
                  <Badge>
                    {String(person.membershipStatus || 'leader').replace('-', ' ')}
                  </Badge>
                  <CardTitle>{personName(person) || 'Leader'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    {person.email
                      ? person.email
                      : 'Connect with a ministry leader through the church office.'}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </CardGrid>
        </Section>
      )

    case 'signupForm':
      return (
        <Section className={index > 0 ? 'mt-8' : ''} key={block.id || `signup-${index}`}>
          <Card className="items-start" style={signupCardStyle}>
            <CardHeader>
              <Badge>
                {String(block.formType || 'next step').replace('-', ' ')}
              </Badge>
              <h2>{String(block.title || '')}</h2>
            </CardHeader>
            <CardContent>
              {block.body ? <CardDescription>{String(block.body)}</CardDescription> : null}
              <HeroActions className="mt-0">
                {block.buttonLabel && block.buttonHref ? (
                  <Button asChild>
                    <a href={String(block.buttonHref)}>{String(block.buttonLabel)}</a>
                  </Button>
                ) : null}
                {block.emailDestination ? (
                  <Button asChild variant="secondary">
                    <a href={`mailto:${String(block.emailDestination)}`}>Email the team</a>
                  </Button>
                ) : null}
              </HeroActions>
              {block.helperText ? (
                <p className="text-sm text-muted-foreground">{String(block.helperText)}</p>
              ) : null}
            </CardContent>
          </Card>
        </Section>
      )

    case 'relatedFeed': {
      const feedType = String(block.feedType || '')
      const items = readArray<RelatedFeedItem>(block.resolvedItems)

      if (!items.length) return null

      return (
        <Section
          className={index > 0 ? 'mt-8' : ''}
          description={block.intro ? String(block.intro) : undefined}
          key={block.id || `feed-${index}`}
          title={String(block.title || 'Related content')}
        >
          <CardGrid>
            {items.map((item, itemIndex: number) => {
              const href = getFeedLink({ churchSlug: church.slug, feedType, item })

              return (
                <Card
                  key={`${block.id || index}-${item.id || itemIndex}`}
                  style={landingCardStyle}
                >
                  <CardHeader>
                    <Badge>{feedType.replace('-', ' ')}</Badge>
                    <CardTitle>{String(item.title || 'Untitled')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {item.summary ? (
                      <CardDescription>{String(item.summary)}</CardDescription>
                    ) : null}
                    {item.startDate ? (
                      <p className="text-sm text-muted-foreground">
                        {new Date(String(item.startDate)).toLocaleDateString()}
                      </p>
                    ) : null}
                    {item.preachedAt ? (
                      <p className="text-sm text-muted-foreground">
                        {new Date(String(item.preachedAt)).toLocaleDateString()}
                      </p>
                    ) : null}
                    {item.location ? (
                      <p className="text-sm text-muted-foreground">{String(item.location)}</p>
                    ) : null}
                    {item.speaker ? (
                      <p className="text-sm text-muted-foreground">{String(item.speaker)}</p>
                    ) : null}
                  </CardContent>
                  {href ? (
                    <CardFooter>
                      <Button asChild size="sm" variant="link">
                        <a href={href}>
                          Open{' '}
                          {feedType === 'events'
                            ? 'registration'
                            : feedType === 'sermons'
                              ? 'message'
                              : 'page'}
                        </a>
                      </Button>
                    </CardFooter>
                  ) : null}
                </Card>
              )
            })}
          </CardGrid>
        </Section>
      )
    }

    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function LandingPageRenderer({
  blocks,
  church,
  entity,
  pageType,
  relatedCourses = [],
  relatedGroups = [],
}: LandingPageRendererProps) {
  const entityLabel =
    pageType === 'ministry'
      ? 'Ministry landing page'
      : pageType === 'group'
        ? 'Group landing page'
        : 'Course landing page'

  const hasCustomBlocks = Boolean(blocks?.length)

  return (
    <div className="py-8 pb-16">
      {hasCustomBlocks ? (
        blocks?.map((block, index) => renderBlock({ block, church, index }))
      ) : (
        <Hero variant="landing">
          <Eyebrow>{entityLabel}</Eyebrow>
          <h1>{String(entity.title || '')}</h1>
          <p className="mt-4 max-w-[52rem] text-lg">{String(entity.summary || '')}</p>
          <HeroActions>
            {church.givingUrl ? (
              <Button asChild>
                <a href={church.givingUrl}>Give online</a>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href={`/churches/${church.slug}`}>Back to church</Link>
            </Button>
          </HeroActions>
        </Hero>
      )}

      <Section
        description="These default sections always inherit the church theme unless the page has scoped overrides."
        title="Quick details"
      >
        <CardGrid>
          {pageType === 'ministry' ? (
            <>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Audience</CardTitle></CardHeader>
                <CardContent><CardDescription>{String(entity.audience || '')}</CardDescription></CardContent>
              </Card>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
                <CardContent><CardDescription>{String(entity.schedule || '')}</CardDescription></CardContent>
              </Card>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
                <CardContent><CardDescription>{String(entity.summary || '')}</CardDescription></CardContent>
              </Card>
            </>
          ) : null}

          {pageType === 'group' ? (
            <>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
                <CardContent><CardDescription>{String(entity.schedule || '')}</CardDescription></CardContent>
              </Card>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Location</CardTitle></CardHeader>
                <CardContent><CardDescription>{entity.location || 'Location shared after signup'}</CardDescription></CardContent>
              </Card>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Enrollment</CardTitle></CardHeader>
                <CardContent><CardDescription>{entity.openEnrollment ? 'Open now' : 'Request to join'}</CardDescription></CardContent>
              </Card>
            </>
          ) : null}

          {pageType === 'course' ? (
            <>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Duration</CardTitle></CardHeader>
                <CardContent><CardDescription>{String(entity.duration || '')}</CardDescription></CardContent>
              </Card>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Format</CardTitle></CardHeader>
                <CardContent><CardDescription>{String(entity.deliveryMode || '').replace('-', ' ')}</CardDescription></CardContent>
              </Card>
              <Card style={landingCardStyle}>
                <CardHeader><CardTitle>Audience</CardTitle></CardHeader>
                <CardContent><CardDescription>{String(entity.audience || '')}</CardDescription></CardContent>
              </Card>
            </>
          ) : null}
        </CardGrid>
      </Section>

      {pageType === 'ministry' && relatedGroups.length ? (
        <Section
          description="Groups inherit church branding by default, with optional landing-page customization."
          title="Related groups"
        >
          <CardGrid>
            {relatedGroups.map((group) => (
              <Card key={group.id} style={landingCardStyle}>
                <CardHeader>
                  <Badge>{String(group.groupType || '').replace('-', ' ')}</Badge>
                  <CardTitle>{String(group.title || '')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{String(group.summary || '')}</CardDescription>
                </CardContent>
                <CardFooter>
                  <Button asChild size="sm" variant="link">
                    <Link href={`/churches/${church.slug}/groups/${group.slug || ''}`}>
                      Open group page
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </CardGrid>
        </Section>
      ) : null}

      {pageType !== 'course' && relatedCourses.length ? (
        <Section
          description="Use courses for volunteer training, member onboarding, and curriculum-based discipleship."
          title="Related courses"
        >
          <CardGrid>
            {relatedCourses.map((course) => (
              <Card key={course.id} style={landingCardStyle}>
                <CardHeader>
                  <Badge>{String(course.courseType || '').replace('-', ' ')}</Badge>
                  <CardTitle>{String(course.title || '')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{String(course.summary || '')}</CardDescription>
                  <p className="text-sm text-muted-foreground">
                    {String(course.duration || '')}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button asChild size="sm" variant="link">
                    <Link href={`/churches/${church.slug}/courses/${course.slug || ''}`}>
                      Open course page
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </CardGrid>
        </Section>
      ) : null}

      {pageType === 'course' && entity.lessons?.length ? (
        <Section
          description="Landing pages can add editorial content while the structured lesson list stays synchronized."
          title="Course outline"
        >
          <CardGrid>
            {entity.lessons.map((lesson, index: number) => (
              <Card key={lesson.id || `${entity.id}-${index}`} style={landingCardStyle}>
                <CardHeader>
                  <Badge>{lesson.estimatedMinutes || 15} minutes</Badge>
                  <CardTitle>{String(lesson.title || '')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{String(lesson.summary || '')}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </CardGrid>
        </Section>
      ) : null}
    </div>
  )
}
