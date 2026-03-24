import Link from 'next/link'

import { joinGroupAction, startCourseAction } from '@/app/(frontend)/portal/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CardGrid } from '@/components/card-grid'
import { Eyebrow } from '@/components/eyebrow'
import { Hero, HeroActions } from '@/components/hero'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { SignOutButton } from '@/components/SignOutButton'
import { getPortalDashboard } from '@/lib/portal'
import { requireSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function PortalPage() {
  const user = await requireSessionUser()
  const portal = await getPortalDashboard(user)

  if (!portal) {
    return (
      <PageShell>
        <Section>
          <div className="grid gap-2">
            <h1>Portal unavailable</h1>
            <p>Your account needs a church and person record before the portal can load.</p>
            <HeroActions>
              <Button asChild variant="secondary">
                <Link href="/">Back to site</Link>
              </Button>
              <SignOutButton />
            </HeroActions>
          </div>
        </Section>
      </PageShell>
    )
  }

  const displayName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email

  return (
    <PageShell padBottom>
      <Section>
        <Eyebrow>Member portal</Eyebrow>
        <h1>{displayName}</h1>
        <p className="mt-2">
          {portal.church.name} member workspace for groups, classes, and personal progress through
          church training.
        </p>
        <HeroActions>
          <Button asChild variant="secondary">
            <Link href="/">Back to site</Link>
          </Button>
          <SignOutButton />
          {user.roles?.includes('ministry-leader') || user.roles?.includes('church-admin') ? (
            <Button asChild>
              <Link href="/portal/leader">Open leader view</Link>
            </Button>
          ) : null}
        </HeroActions>
      </Section>

      <Section
        title="Your groups"
        description="Current group memberships, Sunday school classes, and recurring gatherings."
      >
        <CardGrid>
          {portal.memberships.map((membership) => {
            const group = typeof membership.group === 'object' && membership.group ? membership.group : null
            if (!group) return null

            return (
              <Card key={membership.id}>
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
                  <p className="text-sm text-muted-foreground">Status: {membership.status}</p>
                </CardContent>
              </Card>
            )
          })}
          {!portal.memberships.length && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>No groups joined yet</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Join a group below to start participating in classes, Bible studies, or small groups.
                </CardDescription>
              </CardContent>
            </Card>
          )}
        </CardGrid>
      </Section>

      <Section
        title="Discover groups"
        description="Open-enrollment groups and classes available for this member account."
      >
        <CardGrid>
          {portal.availableGroups.map((group) => (
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
                <form action={joinGroupAction}>
                  <input name="groupID" type="hidden" value={String(group.id)} />
                  <Button size="sm" type="submit">Join group</Button>
                </form>
              </CardFooter>
            </Card>
          ))}
        </CardGrid>
      </Section>

      <Section
        title="Your courses"
        description="Track progress through membership classes, volunteer training, and discipleship content."
      >
        <CardGrid>
          {portal.enrollments.map((enrollment) => {
            const course = typeof enrollment.course === 'object' && enrollment.course ? enrollment.course : null
            if (!course) return null

            return (
              <Card key={enrollment.id}>
                <CardHeader>
                  <Badge>{course.deliveryMode.replace('-', ' ')}</Badge>
                  <CardTitle>{course.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{course.summary}</CardDescription>
                  <p className="text-sm text-muted-foreground">
                    Progress: {enrollment.progressPercent}% · {enrollment.status}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="link" size="sm">
                    <Link href={`/portal/courses/${course.slug}`}>Open course</Link>
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
          {!portal.enrollments.length && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>No active courses yet</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Start a course below to begin member onboarding or volunteer training.
                </CardDescription>
              </CardContent>
            </Card>
          )}
        </CardGrid>
      </Section>

      <Section
        title="Available courses"
        description="Courses can be taken individually or as part of a group or training cohort."
      >
        <CardGrid>
          {portal.availableCourses.map((course) => (
            <Card key={course.id}>
              <CardHeader>
                <Badge>{course.courseType.replace('-', ' ')}</Badge>
                <CardTitle>{course.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{course.summary}</CardDescription>
                <p className="text-sm text-muted-foreground">
                  {course.duration} · {course.lessons?.length ?? 0} lessons
                </p>
              </CardContent>
              <CardFooter>
                <form action={startCourseAction}>
                  <input name="courseID" type="hidden" value={String(course.id)} />
                  <input name="courseSlug" type="hidden" value={course.slug} />
                  <Button size="sm" type="submit">Start course</Button>
                </form>
              </CardFooter>
            </Card>
          ))}
        </CardGrid>
      </Section>
    </PageShell>
  )
}
