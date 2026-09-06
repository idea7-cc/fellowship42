import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  CourseEnrollment,
  GroupRoster,
  GroupSession,
  SessionAttendance,
} from '../src/lib/api-types'
import type { AccessIdentity } from '../worker/lib/auth'
import { AppError } from '../worker/lib/errors'
import { courseRoutes } from '../worker/routes/courses'
import { groupRoutes } from '../worker/routes/groups'
import { peopleRoutes } from '../worker/routes/people'

const owner: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'demo-owner-access-subject',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}

const financeOnly: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'participation-finance-subject',
  email: 'finance@example.test',
  firstName: 'Finance',
  lastName: 'Only',
}

function participationApp(requestIdentity: AccessIdentity) {
  const app = new Hono<{
    Bindings: Env
    Variables: { identity: AccessIdentity | null; requestId: string }
  }>()
  app.use('*', async (c, next) => {
    c.set('identity', requestIdentity)
    c.set('requestId', 'request_participation_test')
    await next()
  })
  app.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500
    return c.json(
      {
        error: {
          code: error instanceof AppError ? error.code : 'internal_error',
          message:
            error instanceof HTTPException
              ? error.message
              : 'Internal server error',
        },
      },
      status,
    )
  })
  app.route('/api/people', peopleRoutes)
  app.route('/api/groups', groupRoutes)
  app.route('/api/courses', courseRoutes)
  return app
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} as unknown as ExecutionContext

function requestAs(identity: AccessIdentity) {
  const app = participationApp(identity)
  return (method: string, pathname: string, body?: unknown) =>
    app.fetch(
      new Request(`https://fellowship42.test${pathname}`, {
        method,
        headers:
          body === undefined
            ? undefined
            : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      executionContext,
    )
}

const request = requestAs(owner)

// The seed creates the owner user but no Access identity, because the worker
// deliberately refuses to auto-link a new subject to an existing active user.
// Tests bind the link explicitly, as the other suites do.
beforeEach(async () => {
  const now = Date.now()
  await env.DB.prepare(
    `
        INSERT OR IGNORE INTO auth_identities (
          id, user_id, provider, subject, email_at_provider, created_at, updated_at
        ) VALUES ('identity_demo_owner', 'user_demo_owner', ?, ?, ?, ?, ?)
      `,
  )
    .bind(owner.provider, owner.subject, owner.email, now, now)
    .run()
})

async function createPerson(first: string, last: string) {
  const response = await request('POST', '/api/people/church_demo', {
    firstName: first,
    lastName: last,
  })
  expect(response.status).toBe(201)
  const body = await response.json<{ person: { id: string } }>()
  return body.person.id
}

async function createGroup(title: string, slug: string, capacity?: number) {
  const response = await request('POST', '/api/groups/church_demo', {
    slug,
    title,
    groupType: 'small-group',
    ...(capacity === undefined ? {} : { capacity }),
  })
  expect(response.status).toBe(201)
  const body = await response.json<{ group: { id: string } }>()
  return body.group.id
}

async function createCourse(title: string, slug: string) {
  const response = await request('POST', '/api/courses/church_demo', {
    slug,
    title,
    courseType: 'formation',
    deliveryMode: 'cohort',
  })
  expect(response.status).toBe(201)
  const body = await response.json<{ course: { id: string } }>()
  return body.course.id
}

describe('group rosters', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM group_memberships').run()
    await env.DB.prepare('DELETE FROM group_leaders').run()
  })

  it('adds, updates, and removes members and leaders', async () => {
    const groupId = await createGroup('Roster Group', 'roster-group')
    const alice = await createPerson('Alice', 'Roster')
    const bob = await createPerson('Bob', 'Roster')

    const added = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/members/${alice}`,
      { status: 'active' },
    )
    expect(added.status).toBe(200)
    const roster = await added.json<GroupRoster>()
    expect(roster.members).toHaveLength(1)
    expect(roster.members[0].personId).toBe(alice)
    expect(roster.members[0].status).toBe('active')
    expect(roster.members[0].joinedAt).toBeTruthy()
    expect(roster.activeCount).toBe(1)

    // Re-upserting the same person changes status without duplicating them.
    const paused = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/members/${alice}`,
      { version: 1, status: 'paused', notes: 'Travelling until autumn' },
    )
    const pausedRoster = await paused.json<GroupRoster>()
    expect(pausedRoster.members).toHaveLength(1)
    expect(pausedRoster.members[0].status).toBe('paused')
    expect(pausedRoster.members[0].notes).toBe('Travelling until autumn')
    expect(pausedRoster.activeCount).toBe(0)

    const leader = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/leaders/${bob}`,
      { role: 'leader' },
    )
    const leaderRoster = await leader.json<GroupRoster>()
    expect(leaderRoster.leaders).toHaveLength(1)
    expect(leaderRoster.leaders[0].personId).toBe(bob)
    expect(leaderRoster.leaders[0].role).toBe('leader')

    const removed = await request(
      'DELETE',
      `/api/groups/church_demo/${groupId}/members/${alice}`,
      { version: 2 },
    )
    expect((await removed.json<GroupRoster>()).members).toHaveLength(0)

    const removedLeader = await request(
      'DELETE',
      `/api/groups/church_demo/${groupId}/leaders/${bob}`,
      { version: 1 },
    )
    expect((await removedLeader.json<GroupRoster>()).leaders).toHaveLength(0)
  })

  it('enforces capacity against active members only', async () => {
    const groupId = await createGroup('Tiny Group', 'tiny-group', 1)
    const first = await createPerson('First', 'Seat')
    const second = await createPerson('Second', 'Seat')

    expect(
      (
        await request(
          'PUT',
          `/api/groups/church_demo/${groupId}/members/${first}`,
          {
            status: 'active',
          },
        )
      ).status,
    ).toBe(200)

    const full = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/members/${second}`,
      { status: 'active' },
    )
    expect(full.status).toBe(409)
    expect((await full.json<{ error: { code: string } }>()).error.code).toBe(
      'group_at_capacity',
    )

    // A waiting list still works past capacity.
    const waiting = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/members/${second}`,
      { status: 'interested' },
    )
    expect(waiting.status).toBe(200)
    const roster = await waiting.json<GroupRoster>()
    expect(roster.members).toHaveLength(2)
    expect(roster.activeCount).toBe(1)
  })

  it('rejects a person from outside the church', async () => {
    const groupId = await createGroup('Scoped Group', 'scoped-group')
    const response = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/members/person_does_not_exist`,
      { status: 'active' },
    )
    expect(response.status).toBe(422)
    expect(
      (await response.json<{ error: { code: string } }>()).error.code,
    ).toBe('invalid_person')
  })

  it('denies roster access without the groups permission', async () => {
    const groupId = await createGroup('Private Group', 'private-group')
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO users (id, email, first_name, last_name, status, created_at, updated_at)
           VALUES ('user_participation_finance', 'finance@example.test', 'Finance', 'Only', 'active', ?, ?)`,
      ).bind(now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO auth_identities (id, user_id, provider, subject, email_at_provider, created_at, updated_at)
           VALUES ('authid_participation_finance', 'user_participation_finance', 'cloudflare-access', 'participation-finance-subject', 'finance@example.test', ?, ?)`,
      ).bind(now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO church_memberships (id, church_id, user_id, status, joined_at, created_at, updated_at)
           VALUES ('membership_participation_finance', 'church_demo', 'user_participation_finance', 'active', ?, ?, ?)`,
      ).bind(now, now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO membership_roles (church_id, membership_id, role_id, assigned_at, assigned_by_user_id)
           VALUES ('church_demo', 'membership_participation_finance', 'role_demo_finance', ?, 'user_demo_owner')`,
      ).bind(now),
    ])

    const asFinance = requestAs(financeOnly)
    expect(
      (await asFinance('GET', `/api/groups/church_demo/${groupId}/roster`))
        .status,
    ).toBe(403)
    expect(
      (
        await asFinance(
          'PUT',
          `/api/groups/church_demo/${groupId}/members/whoever`,
          {
            status: 'active',
          },
        )
      ).status,
    ).toBe(403)
  })
})

describe('course enrollments', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM course_enrollments').run()
  })

  it('enrolls a person and a group, updates status, and removes', async () => {
    const courseId = await createCourse(
      'Enrollable Course',
      'enrollable-course',
    )
    const personId = await createPerson('Enrolled', 'Person')
    const groupId = await createGroup('Enrolled Group', 'enrolled-group')

    const person = await request(
      'POST',
      `/api/courses/church_demo/${courseId}/enrollments`,
      { personId, status: 'active' },
    )
    expect(person.status).toBe(201)
    const afterPerson = await person.json<{ enrollments: CourseEnrollment[] }>()
    expect(afterPerson.enrollments).toHaveLength(1)
    expect(afterPerson.enrollments[0].subjectName).toBe('Enrolled Person')
    expect(afterPerson.enrollments[0].startedAt).toBeTruthy()

    const group = await request(
      'POST',
      `/api/courses/church_demo/${courseId}/enrollments`,
      { groupId },
    )
    expect(group.status).toBe(201)
    const afterGroup = await group.json<{ enrollments: CourseEnrollment[] }>()
    expect(afterGroup.enrollments).toHaveLength(2)
    expect(
      afterGroup.enrollments.some(
        (entry) => entry.subjectName === 'Enrolled Group',
      ),
    ).toBe(true)

    const enrollmentId = afterPerson.enrollments[0].id
    const completed = await request(
      'PATCH',
      `/api/courses/church_demo/${courseId}/enrollments/${enrollmentId}`,
      { version: afterPerson.enrollments[0].version, status: 'completed' },
    )
    const afterComplete = await completed.json<{
      enrollments: CourseEnrollment[]
    }>()
    const updated = afterComplete.enrollments.find(
      (entry) => entry.id === enrollmentId,
    )
    expect(updated?.status).toBe('completed')
    expect(updated?.completedAt).toBeTruthy()

    const removed = await request(
      'DELETE',
      `/api/courses/church_demo/${courseId}/enrollments/${enrollmentId}`,
      { version: updated?.version },
    )
    const afterRemove = await removed.json<{
      enrollments: CourseEnrollment[]
    }>()
    expect(afterRemove.enrollments).toHaveLength(1)
  })

  it('rejects enrolling both a person and a group at once', async () => {
    const courseId = await createCourse('Either Course', 'either-course')
    const personId = await createPerson('Either', 'Person')
    const groupId = await createGroup('Either Group', 'either-group')

    const response = await request(
      'POST',
      `/api/courses/church_demo/${courseId}/enrollments`,
      { personId, groupId },
    )
    expect(response.status).toBe(422)
  })

  it('rejects a duplicate enrollment for the same person', async () => {
    const courseId = await createCourse('Once Course', 'once-course')
    const personId = await createPerson('Once', 'Only')

    expect(
      (
        await request(
          'POST',
          `/api/courses/church_demo/${courseId}/enrollments`,
          {
            personId,
          },
        )
      ).status,
    ).toBe(201)

    const duplicate = await request(
      'POST',
      `/api/courses/church_demo/${courseId}/enrollments`,
      { personId },
    )
    expect(duplicate.status).toBe(409)
    expect(
      (await duplicate.json<{ error: { code: string } }>()).error.code,
    ).toBe('already_enrolled')
  })
})

describe('group sessions and attendance', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM attendance_records').run()
    await env.DB.prepare('DELETE FROM group_sessions').run()
    await env.DB.prepare('DELETE FROM group_memberships').run()
  })

  async function seedSession(groupId: string, title = 'Week 1') {
    const response = await request(
      'POST',
      `/api/groups/church_demo/${groupId}/sessions`,
      { title, startsAt: Date.now(), status: 'open' },
    )
    expect(response.status).toBe(201)
    const body = await response.json<{ sessions: GroupSession[] }>()
    return body.sessions[0]
  }

  it('creates, updates, and removes sessions', async () => {
    const groupId = await createGroup('Session Group', 'session-group')
    const session = await seedSession(groupId)
    expect(session.title).toBe('Week 1')
    expect(session.status).toBe('open')

    const updated = await request(
      'PATCH',
      `/api/groups/church_demo/${groupId}/sessions/${session.id}`,
      { version: session.version, status: 'submitted', topic: 'Psalm 23' },
    )
    const afterUpdate = await updated.json<{ sessions: GroupSession[] }>()
    expect(afterUpdate.sessions[0].status).toBe('submitted')
    expect(afterUpdate.sessions[0].topic).toBe('Psalm 23')

    const removed = await request(
      'DELETE',
      `/api/groups/church_demo/${groupId}/sessions/${session.id}`,
      { version: afterUpdate.sessions[0].version },
    )
    expect(
      (await removed.json<{ sessions: GroupSession[] }>()).sessions,
    ).toHaveLength(0)
  })

  it('rejects a session that ends before it starts', async () => {
    const groupId = await createGroup('Backwards Group', 'backwards-group')
    const startsAt = Date.now()
    const response = await request(
      'POST',
      `/api/groups/church_demo/${groupId}/sessions`,
      { title: 'Impossible', startsAt, endsAt: startsAt - 3_600_000 },
    )
    expect(response.status).toBe(422)
  })

  it('returns the roster as the register and records marks', async () => {
    const groupId = await createGroup('Register Group', 'register-group')
    const present = await createPerson('Present', 'Person')
    const absent = await createPerson('Absent', 'Person')
    for (const personId of [present, absent]) {
      await request(
        'PUT',
        `/api/groups/church_demo/${groupId}/members/${personId}`,
        {
          status: 'active',
        },
      )
    }
    const session = await seedSession(groupId)

    // Every roster member appears, unmarked, before anyone is recorded.
    const initial = await request(
      'GET',
      `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance`,
    )
    const before = await initial.json<SessionAttendance>()
    expect(before.entries).toHaveLength(2)
    expect(before.entries.every((entry) => entry.status === undefined)).toBe(
      true,
    )
    expect(before.recordedCount).toBe(0)

    const marked = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance/${present}`,
      { status: 'present' },
    )
    const afterMark = await marked.json<SessionAttendance>()
    expect(afterMark.presentCount).toBe(1)
    expect(afterMark.recordedCount).toBe(1)
    const presentEntry = afterMark.entries.find(
      (entry) => entry.personId === present,
    )
    expect(presentEntry?.status).toBe('present')
    expect(presentEntry?.checkedInAt).toBeTruthy()

    // Re-marking the same person updates rather than duplicating.
    const changed = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance/${present}`,
      {
        version: presentEntry?.version,
        status: 'excused',
        notes: 'Away for work',
      },
    )
    const afterChange = await changed.json<SessionAttendance>()
    expect(afterChange.entries).toHaveLength(2)
    expect(afterChange.presentCount).toBe(0)
    expect(afterChange.recordedCount).toBe(1)
    expect(
      afterChange.entries.find((entry) => entry.personId === present)?.notes,
    ).toBe('Away for work')
  })

  it('refuses to mark someone who is not on the roster', async () => {
    const groupId = await createGroup('Closed Register', 'closed-register')
    const outsider = await createPerson('Not', 'Amember')
    const session = await seedSession(groupId)

    const response = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance/${outsider}`,
      { status: 'present' },
    )
    expect(response.status).toBe(422)
    expect(
      (await response.json<{ error: { code: string } }>()).error.code,
    ).toBe('not_a_group_member')
  })

  it('separates the attendance permission from group editing', async () => {
    const groupId = await createGroup('Permission Group', 'permission-group')
    const session = await seedSession(groupId)
    const now = Date.now()

    // The seeded ministry-leader role carries attendance.write and groups.write.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO users (id, email, first_name, last_name, status, created_at, updated_at)
           VALUES ('user_participation_leader', 'leader@example.test', 'Ministry', 'Leader', 'active', ?, ?)`,
      ).bind(now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO auth_identities (id, user_id, provider, subject, email_at_provider, created_at, updated_at)
           VALUES ('authid_participation_leader', 'user_participation_leader', 'cloudflare-access', 'participation-leader-subject', 'leader@example.test', ?, ?)`,
      ).bind(now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO church_memberships (id, church_id, user_id, status, joined_at, created_at, updated_at)
           VALUES ('membership_participation_leader', 'church_demo', 'user_participation_leader', 'active', ?, ?, ?)`,
      ).bind(now, now, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO membership_roles (church_id, membership_id, role_id, assigned_at, assigned_by_user_id)
           VALUES ('church_demo', 'membership_participation_leader', 'role_demo_leader', ?, 'user_demo_owner')`,
      ).bind(now),
    ])

    const asLeader = requestAs({
      provider: 'cloudflare-access',
      subject: 'participation-leader-subject',
      email: 'leader@example.test',
      firstName: 'Ministry',
      lastName: 'Leader',
    })
    expect(
      (
        await asLeader(
          'GET',
          `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance`,
        )
      ).status,
    ).toBe(200)

    // Finance has neither permission.
    const asFinance = requestAs(financeOnly)
    expect(
      (
        await asFinance(
          'GET',
          `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance`,
        )
      ).status,
    ).toBe(403)
  })
})

describe('participation concurrency regressions', () => {
  it('admits only one concurrent applicant for the final seat and audits only the winner', async () => {
    const groupId = await createGroup('Concurrent Seats', 'concurrent-seats', 1)
    const people = await Promise.all([
      createPerson('Seat', 'One'),
      createPerson('Seat', 'Two'),
    ])
    const replies = await Promise.all(
      people.map((personId) =>
        request(
          'PUT',
          `/api/groups/church_demo/${groupId}/members/${personId}`,
          { status: 'active' },
        ),
      ),
    )
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409])
    const roster = await (
      await request('GET', `/api/groups/church_demo/${groupId}/roster`)
    ).json<GroupRoster>()
    expect(roster.activeCount).toBe(1)
    const evidence = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ? AND action = 'groups.member.upserted'",
    )
      .bind(groupId)
      .first<{ count: number }>()
    expect(evidence?.count).toBe(1)
    const parent = await env.DB.prepare(
      'SELECT version FROM groups WHERE id = ?',
    )
      .bind(groupId)
      .first<{ version: number }>()
    expect(parent?.version).toBe(1)
  })

  it('rejects stale membership edits and removals without changing the record', async () => {
    const groupId = await createGroup('Versioned Roster', 'versioned-roster')
    const personId = await createPerson('Versioned', 'Member')
    const path = `/api/groups/church_demo/${groupId}/members/${personId}`
    expect((await request('PUT', path, { status: 'active' })).status).toBe(200)
    expect(
      (
        await request('PUT', path, {
          version: 1,
          status: 'paused',
          notes: 'Keep this',
        })
      ).status,
    ).toBe(200)
    expect(
      (await request('PUT', path, { version: 1, status: 'completed' })).status,
    ).toBe(409)
    expect((await request('PUT', path, { status: 'active' })).status).toBe(409)
    expect((await request('DELETE', path, { version: 1 })).status).toBe(409)
    const roster = await (
      await request('GET', `/api/groups/church_demo/${groupId}/roster`)
    ).json<GroupRoster>()
    expect(roster.members[0]).toMatchObject({
      status: 'paused',
      notes: 'Keep this',
      version: 2,
    })
  })

  it('rejects stale session patches and attendance marks while preserving independent edits', async () => {
    const groupId = await createGroup(
      'Versioned Sessions',
      'versioned-sessions',
    )
    const personId = await createPerson('Versioned', 'Attendee')
    await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/members/${personId}`,
      { status: 'active' },
    )
    const base = `/api/groups/church_demo/${groupId}/sessions`
    const created = await (
      await request('POST', base, { title: 'Original', startsAt: Date.now() })
    ).json<{ sessions: GroupSession[] }>()
    const session = created.sessions[0]
    const path = `${base}/${session.id}`
    expect(
      (
        await request('PATCH', path, {
          version: session.version,
          title: 'New title',
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await request('PATCH', path, {
          version: session.version,
          topic: 'Stale change',
        })
      ).status,
    ).toBe(409)
    expect(
      (await request('DELETE', path, { version: session.version })).status,
    ).toBe(409)
    const attendancePath = `${path}/attendance/${personId}`
    expect(
      (await request('PUT', attendancePath, { status: 'present' })).status,
    ).toBe(200)
    expect(
      (
        await request('PUT', attendancePath, {
          version: 1,
          status: 'excused',
          notes: 'Keep',
        })
      ).status,
    ).toBe(200)
    expect(
      (await request('PUT', attendancePath, { version: 1, status: 'absent' }))
        .status,
    ).toBe(409)
    const result = await (
      await request('GET', `${path}/attendance`)
    ).json<SessionAttendance>()
    expect(result.session).toMatchObject({ title: 'New title', version: 2 })
    expect(result.entries[0]).toMatchObject({
      status: 'excused',
      version: 2,
      notes: 'Keep',
    })
  })

  it('clears enrollment notes explicitly and rejects a stale edit or delete', async () => {
    const courseId = await createCourse(
      'Versioned Enrollment',
      'versioned-enrollment',
    )
    const personId = await createPerson('Versioned', 'Student')
    const base = `/api/courses/church_demo/${courseId}/enrollments`
    const created = await (
      await request('POST', base, { personId, notes: 'Original note' })
    ).json<{ enrollments: CourseEnrollment[] }>()
    const enrollment = created.enrollments[0]
    const path = `${base}/${enrollment.id}`
    const changed = await request('PATCH', path, {
      version: enrollment.version,
      status: 'active',
      notes: null,
    })
    expect(changed.status).toBe(200)
    expect(
      (await changed.json<{ enrollments: CourseEnrollment[] }>())
        .enrollments[0],
    ).toMatchObject({ version: 2, status: 'active' })
    const stored = await env.DB.prepare(
      'SELECT notes FROM course_enrollments WHERE id = ?',
    )
      .bind(enrollment.id)
      .first<{ notes: string | null }>()
    expect(stored?.notes).toBeNull()
    expect(
      (
        await request('PATCH', path, {
          version: 1,
          status: 'completed',
          notes: 'Stale note',
        })
      ).status,
    ).toBe(409)
    expect((await request('DELETE', path, { version: 1 })).status).toBe(409)
  })
})
