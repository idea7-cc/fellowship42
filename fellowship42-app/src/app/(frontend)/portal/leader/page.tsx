import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardGrid } from '@/components/card-grid'
import { Eyebrow } from '@/components/eyebrow'
import { HeroActions } from '@/components/hero'
import { PageShell } from '@/components/page-shell'
import { Section } from '@/components/section'
import { SignOutButton } from '@/components/SignOutButton'
import { getLeaderDashboard } from '@/lib/portal'
import { requireSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function LeaderPortalPage() {
  const user = await requireSessionUser()
  const dashboard = await getLeaderDashboard(user)

  if (!dashboard) {
    return (
      <PageShell padBottom>
        <Section>
          <h1>Leader dashboard unavailable</h1>
          <p className="mt-2">Your account is not linked to a leader person record yet.</p>
          <HeroActions>
            <Button asChild variant="secondary">
              <Link href="/portal">Back to member portal</Link>
            </Button>
            <SignOutButton />
          </HeroActions>
        </Section>
      </PageShell>
    )
  }

  return (
    <PageShell padBottom>
      <Section>
        <Eyebrow>Leader dashboard</Eyebrow>
        <h1>Groups you lead</h1>
        <p className="mt-2">Roster visibility, upcoming sessions, and the latest submitted attendance for leaders.</p>
        <HeroActions>
          <Button asChild variant="secondary">
            <Link href="/portal">Back to member portal</Link>
          </Button>
          <SignOutButton />
        </HeroActions>
      </Section>

      <Section>
        <CardGrid>
          {dashboard.groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle>{group.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{group.schedule}</p>
                <p className="text-sm text-muted-foreground">{group.location}</p>
                <p className="text-sm">{group.roster.length} active roster entries</p>

                <div className="mt-2 grid gap-1">
                  <strong className="text-sm font-semibold">Roster</strong>
                  {group.roster.map((membership) => {
                    const person =
                      typeof membership.person === 'object' && membership.person ? membership.person : null
                    return (
                      <p className="m-0 text-sm text-muted-foreground" key={membership.id}>
                        {person ? `${person.firstName} ${person.lastName}` : 'Member'} · {membership.role} ·{' '}
                        {membership.status}
                      </p>
                    )
                  })}
                </div>

                <div className="mt-2 grid gap-1">
                  <strong className="text-sm font-semibold">Upcoming sessions</strong>
                  {group.upcomingSessions.map((session) => (
                    <div className="grid gap-1" key={session.id}>
                      <p className="m-0 text-sm">
                        {session.title} · {session.date} · {session.attendanceStatus}
                      </p>
                      {(dashboard.attendanceBySession.get(session.id) ?? []).map((entry, index) => (
                        <p
                          className="m-0 text-xs text-muted-foreground"
                          key={`${session.id}-${entry.personName}-${index}`}
                        >
                          {entry.personName} · {entry.status}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </CardGrid>
      </Section>
    </PageShell>
  )
}
