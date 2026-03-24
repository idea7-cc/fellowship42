import Link from 'next/link'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CardGrid } from '@/components/card-grid'
import { Eyebrow } from '@/components/eyebrow'
import { Hero, HeroActions } from '@/components/hero'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { StatPanel } from '@/components/stat-panel'
import { getPublishedChurches } from '@/lib/public-site'

export const dynamic = 'force-dynamic'

const features = [
  {
    title: 'Church records',
    body: 'Churches, users, people, and ministry structures with role-aware admin access.',
  },
  {
    title: 'Programs and events',
    body: 'Upcoming events, featured ministries, sermon publishing, and church-specific site pages.',
  },
  {
    title: 'Groups and classes',
    body: 'Sunday school, small groups, Bible studies, and recurring cohorts all fit the same group model.',
  },
  {
    title: 'Training and curriculum',
    body: 'Courses support new-member tracks, volunteer training, and reusable lesson libraries.',
  },
  {
    title: 'Operations',
    body: 'Facilities and contributions establish the base for scheduling and finance workflows.',
  },
]

const stats = [
  { value: '1', label: 'shared source of truth for members, ministries, giving, and events' },
  { value: '7', label: 'core ministry workflows: people, giving, events, facilities, ministries, groups, courses' },
  { value: 'Cloudflare', label: 'edge delivery with Payload on a Postgres-backed application core' },
]

export default async function HomePage() {
  const churches = await getPublishedChurches()

  return (
    <PageShell>
      <Hero>
        <Eyebrow>Payload-powered church operations</Eyebrow>
        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <div>
            <h1>Run the church from one system instead of five.</h1>
            <p className="mt-4 max-w-[52rem] text-lg">
              Fellowship42 is built for churches that need one place to manage ministries,
              people, contributions, events, facilities, and a visitor-ready website.
            </p>
            <HeroActions>
              <Button asChild>
                <Link href="/admin">Open admin</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/portal">Open member portal</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/churches/demo-fellowship">View demo church</Link>
              </Button>
            </HeroActions>
          </div>
          <StatPanel stats={stats} />
        </div>
      </Hero>

      <Section
        title="What the MVP already covers"
        description="Payload collections and public routes are wired for the first church software workflow."
      >
        <CardGrid>
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </CardGrid>
      </Section>

      <Section
        title="Published churches"
        description="The homepage lists churches that have been published through Payload."
      >
        <CardGrid>
          {churches.docs.map((church) => (
            <Card key={church.id}>
              <CardHeader>
                <div className="flex flex-wrap gap-3 text-xs uppercase tracking-wide text-muted-foreground font-sans">
                  <span>{church.address?.city}, {church.address?.state}</span>
                  <span>{church.serviceTimes?.length ?? 0} service times</span>
                </div>
                <CardTitle>{church.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{church.summary}</CardDescription>
              </CardContent>
              <CardFooter>
                <Button asChild variant="link" size="sm">
                  <Link href={`/churches/${church.slug}`}>Visit church site</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
          {!churches.docs.length && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>No churches published yet</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Create a church in the admin panel, mark it as published, and it will appear here.
                </CardDescription>
              </CardContent>
              <CardFooter>
                <Button asChild variant="link" size="sm">
                  <Link href="/admin">Go to admin</Link>
                </Button>
              </CardFooter>
            </Card>
          )}
        </CardGrid>
      </Section>
    </PageShell>
  )
}
