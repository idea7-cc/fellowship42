import Link from 'next/link'

import { joinGroupAction, startCourseAction } from '@/app/(frontend)/portal/actions'
import { SignOutButton } from '@/components/SignOutButton'
import { getPortalDashboard } from '@/lib/portal'
import { requireSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function PortalPage() {
  const user = await requireSessionUser()
  const portal = await getPortalDashboard(user)

  if (!portal) {
    return (
      <div className="site-shell">
        <section className="section">
          <div className="section-heading">
            <h1>Portal unavailable</h1>
            <p>Your account needs a church and person record before the portal can load.</p>
            <div className="hero-actions">
              <Link className="button secondary" href="/">
                Back to site
              </Link>
              <SignOutButton />
            </div>
          </div>
        </section>
      </div>
    )
  }

  const displayName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email

  return (
    <div className="site-shell portal-shell">
      <section className="section">
        <div className="section-heading">
          <div className="eyebrow">Member portal</div>
          <h1>{displayName}</h1>
          <p>
            {portal.church.name} member workspace for groups, classes, and personal progress through
            church training.
          </p>
          <div className="hero-actions">
            <Link className="button secondary" href="/">
              Back to site
            </Link>
            <SignOutButton />
            {user.roles?.includes('ministry-leader') || user.roles?.includes('church-admin') ? (
              <Link className="button primary" href="/portal/leader">
                Open leader view
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Your groups</h2>
          <p>Current group memberships, Sunday school classes, and recurring gatherings.</p>
        </div>
        <div className="card-grid">
          {portal.memberships.map((membership) => {
            const group = typeof membership.group === 'object' && membership.group ? membership.group : null
            if (!group) {
              return null
            }

            return (
              <article className="feature-card" key={membership.id}>
                <span className="kicker">{group.groupType.replace('-', ' ')}</span>
                <h3>{group.title}</h3>
                <p>{group.summary}</p>
                <p className="muted">
                  {group.schedule}
                  {group.location ? ` · ${group.location}` : ''}
                </p>
                <p className="muted">Status: {membership.status}</p>
              </article>
            )
          })}
          {!portal.memberships.length && (
            <article className="feature-card empty">
              <h3>No groups joined yet</h3>
              <p>Join a group below to start participating in classes, Bible studies, or small groups.</p>
            </article>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Discover groups</h2>
          <p>Open-enrollment groups and classes available for this member account.</p>
        </div>
        <div className="card-grid">
          {portal.availableGroups.map((group) => (
            <article className="feature-card" key={group.id}>
              <span className="kicker">{group.groupType.replace('-', ' ')}</span>
              <h3>{group.title}</h3>
              <p>{group.summary}</p>
              <p className="muted">
                {group.schedule}
                {group.location ? ` · ${group.location}` : ''}
              </p>
              <form action={joinGroupAction}>
                <input name="groupID" type="hidden" value={String(group.id)} />
                <button className="button primary" type="submit">
                  Join group
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Your courses</h2>
          <p>Track progress through membership classes, volunteer training, and discipleship content.</p>
        </div>
        <div className="card-grid">
          {portal.enrollments.map((enrollment) => {
            const course = typeof enrollment.course === 'object' && enrollment.course ? enrollment.course : null
            if (!course) {
              return null
            }

            return (
              <article className="feature-card" key={enrollment.id}>
                <span className="kicker">{course.deliveryMode.replace('-', ' ')}</span>
                <h3>{course.title}</h3>
                <p>{course.summary}</p>
                <p className="muted">
                  Progress: {enrollment.progressPercent}% · {enrollment.status}
                </p>
                <Link className="inline-link" href={`/portal/courses/${course.slug}`}>
                  Open course
                </Link>
              </article>
            )
          })}
          {!portal.enrollments.length && (
            <article className="feature-card empty">
              <h3>No active courses yet</h3>
              <p>Start a course below to begin member onboarding or volunteer training.</p>
            </article>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Available courses</h2>
          <p>Courses can be taken individually or as part of a group or training cohort.</p>
        </div>
        <div className="card-grid">
          {portal.availableCourses.map((course) => (
            <article className="feature-card" key={course.id}>
              <span className="kicker">{course.courseType.replace('-', ' ')}</span>
              <h3>{course.title}</h3>
              <p>{course.summary}</p>
              <p className="muted">
                {course.duration} · {course.lessons?.length ?? 0} lessons
              </p>
              <form action={startCourseAction}>
                <input name="courseID" type="hidden" value={String(course.id)} />
                <input name="courseSlug" type="hidden" value={course.slug} />
                <button className="button primary" type="submit">
                  Start course
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
