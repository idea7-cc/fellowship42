import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CardGrid } from '@/components/card-grid'
import { ChurchTheme } from '@/components/church-theme'
import { Eyebrow } from '@/components/eyebrow'
import { Hero, HeroActions } from '@/components/hero'
import { Section } from '@/components/section'
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

  return (
    <ChurchTheme
      className="mx-auto max-w-[1200px] px-5 py-8 pb-16"
      theme={church.theme}
    >
      <Hero variant="church">
        <Eyebrow>Church website preview</Eyebrow>
        <h1>{church.name}</h1>
        <p className="mt-2 max-w-[52rem] text-lg">{church.tagline}</p>
        <p className="mt-1">{church.summary}</p>
        <HeroActions>
          {church.givingUrl ? (
            <Button asChild>
              <a href={church.givingUrl} rel="noreferrer" target="_blank">
                Give online
              </a>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/admin">Configure giving</Link>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/">Back to platform</Link>
          </Button>
        </HeroActions>
      </Hero>

      <Section
        title="Plan your visit"
        description={`${church.address?.street}, ${church.address?.city}, ${church.address?.state} ${church.address?.postalCode}`}
      >
        <CardGrid>
          {church.serviceTimes?.map((service, index) => (
            <Card key={`${service.day}-${service.time}-${index}`}>
              <CardHeader>
                <CardTitle>{service.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{service.day}</p>
                <p className="text-sm text-muted-foreground">{service.time}</p>
              </CardContent>
            </Card>
          ))}
        </CardGrid>
      </Section>

      <Section
        title="Featured ministries"
        description="Use Payload to keep ministry pages and schedules current for attenders and volunteers."
      >
        <CardGrid>
          {ministries.map((ministry) => (
            <Card key={ministry.id}>
              <CardHeader>
                <Badge>{ministry.audience}</Badge>
                <CardTitle>{ministry.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{ministry.summary}</CardDescription>
                <p className="text-sm text-muted-foreground">{ministry.schedule}</p>
              </CardContent>
              <CardFooter>
                <Button asChild variant="link" size="sm">
                  <Link href={`/churches/${church.slug}/ministries/${ministry.slug}`}>
                    Open landing page
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </CardGrid>
      </Section>

      <Section
        title="Groups and classes"
        description="Ministries are the umbrella. Groups are the recurring gatherings people actually join: Sunday school, small groups, Bible studies, and training cohorts."
      >
        <CardGrid>
          {groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <Badge>{group.groupType.replace('-', ' ')}</Badge>
                <CardTitle>{group.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{group.summary}</CardDescription>
                <p className="text-sm text-muted-foreground">
                  {group.schedule}
                  {group.location ? ` · ${group.location}` : ''}
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild variant="link" size="sm">
                  <Link href={`/churches/${church.slug}/groups/${group.slug}`}>
                    Open landing page
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </CardGrid>
      </Section>

      <Section
        title="Courses and training"
        description="Structured training works for new-member pathways, volunteer readiness, and curriculum-based discipleship."
      >
        <CardGrid>
          {courses.map((course) => (
            <Card key={course.id}>
              <CardHeader>
                <Badge>{course.deliveryMode.replace('-', ' ')}</Badge>
                <CardTitle>{course.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{course.summary}</CardDescription>
                <p className="text-sm text-muted-foreground">
                  {course.duration} · {course.audience}
                </p>
                <p className="text-sm text-muted-foreground">{course.lessons?.length ?? 0} lessons</p>
              </CardContent>
              <CardFooter>
                <Button asChild variant="link" size="sm">
                  <Link href={`/churches/${church.slug}/courses/${course.slug}`}>
                    Open landing page
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </CardGrid>
      </Section>

      <Section
        title="Upcoming events"
        description="The same data model can power public promotion and internal operations."
      >
        <CardGrid>
          {events.map((event) => (
            <Card key={event.id}>
              <CardHeader>
                <Badge>{formatEventDate(event.startDate)}</Badge>
                <CardTitle>{event.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{event.summary}</CardDescription>
                <p className="text-sm text-muted-foreground">{event.location}</p>
              </CardContent>
              {event.registrationUrl && (
                <CardFooter>
                  <Button asChild variant="link" size="sm">
                    <a href={event.registrationUrl} rel="noreferrer" target="_blank">
                      Register
                    </a>
                  </Button>
                </CardFooter>
              )}
            </Card>
          ))}
        </CardGrid>
      </Section>

      <Section
        title="Latest sermons"
        description="Payload is also serving the publishing side of the product, not just the admin data."
      >
        <CardGrid>
          {sermons.map((sermon) => (
            <Card key={sermon.id}>
              <CardHeader>
                <Badge>{sermon.series || 'Recent message'}</Badge>
                <CardTitle>{sermon.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{sermon.summary}</CardDescription>
                <p className="text-sm text-muted-foreground">
                  {sermon.speaker} · {formatEventDate(sermon.preachedAt)}
                </p>
              </CardContent>
              {sermon.videoUrl && (
                <CardFooter>
                  <Button asChild variant="link" size="sm">
                    <a href={sermon.videoUrl} rel="noreferrer" target="_blank">
                      Watch sermon
                    </a>
                  </Button>
                </CardFooter>
              )}
            </Card>
          ))}
        </CardGrid>
      </Section>
    </ChurchTheme>
  )
}
