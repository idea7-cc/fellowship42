import Link from 'next/link'

import { SignOutButton } from '@/components/SignOutButton'
import { getLeaderDashboard } from '@/lib/portal'
import { requireSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function LeaderPortalPage() {
  const user = await requireSessionUser()
  const dashboard = await getLeaderDashboard(user)

  if (!dashboard) {
    return (
      <div className="site-shell portal-shell">
        <section className="section">
          <div className="section-heading">
            <h1>Leader dashboard unavailable</h1>
            <p>Your account is not linked to a leader person record yet.</p>
            <div className="hero-actions">
              <Link className="button secondary" href="/portal">
                Back to member portal
              </Link>
              <SignOutButton />
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="site-shell portal-shell">
      <section className="section">
        <div className="section-heading">
          <div className="eyebrow">Leader dashboard</div>
          <h1>Groups you lead</h1>
          <p>Roster visibility, upcoming sessions, and the latest submitted attendance for leaders.</p>
          <div className="hero-actions">
            <Link className="button secondary" href="/portal">
              Back to member portal
            </Link>
            <SignOutButton />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card-grid">
          {dashboard.groups.map((group) => (
            <article className="feature-card" key={group.id}>
              <h3>{group.title}</h3>
              <p className="muted">{group.schedule}</p>
              <p className="muted">{group.location}</p>
              <p>{group.roster.length} active roster entries</p>
              <div className="mini-stack">
                <strong>Roster</strong>
                {group.roster.map((membership) => {
                  const person =
                    typeof membership.person === 'object' && membership.person ? membership.person : null
                  return (
                    <p className="mini-line" key={membership.id}>
                      {person ? `${person.firstName} ${person.lastName}` : 'Member'} · {membership.role} ·{' '}
                      {membership.status}
                    </p>
                  )
                })}
              </div>
              <div className="mini-stack">
                <strong>Upcoming sessions</strong>
                {group.upcomingSessions.map((session) => (
                  <div className="mini-stack" key={session.id}>
                    <p className="mini-line">
                      {session.title} · {session.date} · {session.attendanceStatus}
                    </p>
                    {(dashboard.attendanceBySession.get(session.id) ?? []).map((entry, index) => (
                      <p className="mini-line muted" key={`${session.id}-${entry.personName}-${index}`}>
                        {entry.personName} · {entry.status}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
