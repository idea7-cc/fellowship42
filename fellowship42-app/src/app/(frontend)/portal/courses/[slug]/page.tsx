import Link from 'next/link'
import { notFound } from 'next/navigation'

import { toggleLessonCompletionAction } from '@/app/(frontend)/portal/actions'
import { SignOutButton } from '@/components/SignOutButton'
import { getCourseForUser } from '@/lib/portal'
import { requireSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{
    slug: string
  }>
}

export default async function CoursePortalPage({ params }: Args) {
  const user = await requireSessionUser()
  const { slug } = await params
  const courseData = await getCourseForUser(user, slug)

  if (!courseData) {
    notFound()
  }

  const { course, enrollment } = courseData
  const completedLessonIDs = new Set((enrollment?.completedLessons ?? []).map((lesson) => lesson.lessonID))

  return (
    <div className="site-shell portal-shell">
      <section className="section">
        <div className="section-heading">
          <div className="eyebrow">Course workspace</div>
          <h1>{course.title}</h1>
          <p>{course.summary}</p>
          <p className="muted">
            {course.duration} · {course.deliveryMode.replace('-', ' ')} · {enrollment?.progressPercent ?? 0}%
            complete
          </p>
          <div className="hero-actions">
            <Link className="button secondary" href="/portal">
              Back to portal
            </Link>
            <SignOutButton />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Lessons</h2>
          <p>Track lesson completion individually while keeping the course content centrally managed.</p>
        </div>
        <div className="card-grid">
          {course.lessons?.map((lesson) => {
            const lessonID = lesson.id ?? `${course.slug ?? 'course'}-${lesson.title}`
            const isComplete = completedLessonIDs.has(lessonID)

            return (
              <article className="feature-card" key={lessonID}>
                <span className="kicker">{lesson.estimatedMinutes ?? 15} minutes</span>
                <h3>{lesson.title}</h3>
                <p>{lesson.summary}</p>
                <p className="muted">Required: {lesson.required ? 'Yes' : 'Optional'}</p>
                <form action={toggleLessonCompletionAction}>
                  <input name="courseSlug" type="hidden" value={course.slug ?? ''} />
                  <input name="lessonID" type="hidden" value={lessonID} />
                  <input name="lessonTitle" type="hidden" value={lesson.title} />
                  <button className={isComplete ? 'button secondary' : 'button primary'} type="submit">
                    {isComplete ? 'Mark incomplete' : 'Mark complete'}
                  </button>
                </form>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
