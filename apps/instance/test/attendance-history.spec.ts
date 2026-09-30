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

/*
 * Recorded attendance is history. A register shows everyone marked for the
 * session, whatever their roster state is now, plus current active or paused
 * members who are still unmarked. Roster changes must not hide, recount, or
 * lock recorded marks.
 */

const owner: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'demo-owner-access-subject',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}

const app = new Hono<{
  Bindings: Env
  Variables: { identity: AccessIdentity | null; requestId: string }
}>()
app.use('*', async (c, next) => {
  c.set('identity', owner)
  c.set('requestId', 'request_attendance_history')
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

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
} as unknown as ExecutionContext

function request(method: string, pathname: string, body?: unknown) {
  return app.fetch(
    new Request(`https://fellowship42.test${pathname}`, {
      method,
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    executionContext,
  )
}

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

async function createPerson(firstName: string, lastName: string) {
  const response = await request('POST', '/api/people/church_demo', {
    firstName,
    lastName,
  })
  expect(response.status).toBe(201)
  return (await response.json<{ person: { id: string; version: number } }>())
    .person
}

async function createGroup(slug: string) {
  const response = await request('POST', '/api/groups/church_demo', {
    slug,
    title: slug,
    groupType: 'small-group',
  })
  expect(response.status).toBe(201)
  return (await response.json<{ group: { id: string } }>()).group.id
}

async function setMember(
  groupId: string,
  personId: string,
  status: string,
  version = 0,
) {
  const response = await request(
    'PUT',
    `/api/groups/church_demo/${groupId}/members/${personId}`,
    { status, version },
  )
  expect(response.status).toBe(200)
  return response.json<GroupRoster>()
}

async function removeMember(groupId: string, personId: string, version = 1) {
  const response = await request(
    'DELETE',
    `/api/groups/church_demo/${groupId}/members/${personId}`,
    { version },
  )
  expect(response.status).toBe(200)
}

async function createSession(groupId: string, title: string) {
  const response = await request(
    'POST',
    `/api/groups/church_demo/${groupId}/sessions`,
    { title, startsAt: Date.now() - 86_400_000, status: 'submitted' },
  )
  expect(response.status).toBe(201)
  const { sessions } = await response.json<{ sessions: GroupSession[] }>()
  return sessions.find((session) => session.title === title)!
}

/** Two active members, a past submitted session, and both marked present. */
async function markedSession(slug: string) {
  const groupId = await createGroup(slug)
  const stays = await createPerson('Stays', slug)
  const leaves = await createPerson('Leaves', slug)
  await setMember(groupId, stays.id, 'active')
  await setMember(groupId, leaves.id, 'active')
  const session = await createSession(groupId, 'Past week')
  const register = `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance`
  expect(
    (await request('PUT', `${register}/${stays.id}`, { status: 'present' }))
      .status,
  ).toBe(200)
  const marked = await request('PUT', `${register}/${leaves.id}`, {
    status: 'present',
    notes: 'Brought snacks',
  })
  expect(marked.status).toBe(200)
  expect(await marked.json<SessionAttendance>()).toMatchObject({
    presentCount: 2,
    recordedCount: 2,
  })
  return { groupId, stays, leaves, session, register }
}

async function readRegister(register: string) {
  const response = await request('GET', register)
  expect(response.status).toBe(200)
  return response.json<SessionAttendance>()
}

async function attendanceAudits(groupId: string, personId: string) {
  const row = await env.DB.prepare(
    `
      SELECT COUNT(*) AS total FROM audit_events
      WHERE action = 'groups.attendance.recorded' AND entity_id = ?
        AND metadata_json LIKE ?
    `,
  )
    .bind(groupId, `%${personId}%`)
    .first<{ total: number }>()
  return row?.total ?? 0
}

describe('attendance history after roster changes', () => {
  it('keeps a completed member on the register with their mark and notes', async () => {
    const { groupId, leaves, register } = await markedSession('hist-completed')
    await setMember(groupId, leaves.id, 'completed', 1)
    const after = await readRegister(register)
    expect(after).toMatchObject({ presentCount: 2, recordedCount: 2 })
    expect(
      after.entries.find((entry) => entry.personId === leaves.id),
    ).toMatchObject({
      status: 'present',
      rosterStatus: 'completed',
      notes: 'Brought snacks',
    })
  })

  it('keeps marks for members moved back to interested or pending', async () => {
    for (const status of ['interested', 'pending']) {
      const { groupId, leaves, register } = await markedSession(
        `hist-${status}`,
      )
      await setMember(groupId, leaves.id, status, 1)
      const after = await readRegister(register)
      expect(after).toMatchObject({ presentCount: 2, recordedCount: 2 })
      expect(
        after.entries.find((entry) => entry.personId === leaves.id)
          ?.rosterStatus,
      ).toBe(status)
    }
  })

  it('keeps a removed member visible and correctable, but only for sessions they were marked in', async () => {
    const { groupId, leaves, session, register } =
      await markedSession('hist-removed')
    await removeMember(groupId, leaves.id)
    const after = await readRegister(register)
    expect(after).toMatchObject({ presentCount: 2, recordedCount: 2 })
    const entry = after.entries.find((item) => item.personId === leaves.id)!
    expect(entry.rosterStatus).toBeUndefined()
    expect(entry.status).toBe('present')

    const auditsBefore = await attendanceAudits(groupId, leaves.id)
    const corrected = await request('PUT', `${register}/${leaves.id}`, {
      version: entry.version,
      status: 'excused',
      notes: 'Left early',
    })
    expect(corrected.status).toBe(200)
    const correctedBody = await corrected.json<SessionAttendance>()
    expect(
      correctedBody.entries.find((item) => item.personId === leaves.id),
    ).toMatchObject({ status: 'excused', notes: 'Left early' })
    expect(correctedBody).toMatchObject({ presentCount: 1, recordedCount: 2 })
    expect(await attendanceAudits(groupId, leaves.id)).toBe(auditsBefore + 1)

    const stale = await request('PUT', `${register}/${leaves.id}`, {
      version: entry.version,
      status: 'present',
    })
    expect(stale.status).toBe(409)
    expect(await attendanceAudits(groupId, leaves.id)).toBe(auditsBefore + 1)

    const later = await createSession(groupId, 'Next week')
    const unmarked = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/sessions/${later.id}/attendance/${leaves.id}`,
      { status: 'present' },
    )
    expect(unmarked.status).toBe(422)
    expect(
      (await unmarked.json<{ error: { code: string } }>()).error.code,
    ).toBe('not_a_group_member')
    expect(session.id).not.toBe(later.id)
  })

  it('keeps the whole register when every member has left', async () => {
    const { groupId, stays, leaves, register } =
      await markedSession('hist-all-removed')
    await removeMember(groupId, leaves.id)
    await removeMember(groupId, stays.id)
    const after = await readRegister(register)
    expect(after.entries.map((entry) => entry.personId).sort()).toEqual(
      [stays.id, leaves.id].sort(),
    )
    expect(after).toMatchObject({ presentCount: 2, recordedCount: 2 })
  })

  it('shows a removed and re-added member once', async () => {
    const { groupId, leaves, register } = await markedSession('hist-readd')
    await removeMember(groupId, leaves.id)
    await setMember(groupId, leaves.id, 'active')
    const after = await readRegister(register)
    expect(
      after.entries.filter((entry) => entry.personId === leaves.id),
    ).toHaveLength(1)
    expect(after).toMatchObject({ presentCount: 2, recordedCount: 2 })
  })

  it('shows a mark recorded for an interested member', async () => {
    const groupId = await createGroup('hist-interested-mark')
    const waiting = await createPerson('Waiting', 'Listed')
    await setMember(groupId, waiting.id, 'interested')
    const session = await createSession(groupId, 'Visit night')
    const response = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance/${waiting.id}`,
      { status: 'present' },
    )
    expect(response.status).toBe(200)
    const body = await response.json<SessionAttendance>()
    expect(body).toMatchObject({ presentCount: 1, recordedCount: 1 })
    expect(body.entries[0]).toMatchObject({
      personId: waiting.id,
      rosterStatus: 'interested',
      status: 'present',
    })
  })

  it('still refuses to mark someone who was never on the roster', async () => {
    const { groupId, session } = await markedSession('hist-never-member')
    const stranger = await createPerson('Never', 'Member')
    const response = await request(
      'PUT',
      `/api/groups/church_demo/${groupId}/sessions/${session.id}/attendance/${stranger.id}`,
      { status: 'present' },
    )
    expect(response.status).toBe(422)
  })
})

describe('deleted people in participation history', () => {
  // Deleting a person removes them from directory and participation reads,
  // including recorded registers and course enrollments. The D1 rows are kept
  // for referential and audit history, and past counts no longer include them.
  it('hides a deleted person from registers and enrollments while keeping the rows', async () => {
    const { groupId, leaves, register } = await markedSession(
      'hist-person-deleted',
    )
    const courseResponse = await request('POST', '/api/courses/church_demo', {
      slug: 'hist-deleted-course',
      title: 'Deleted person course',
      courseType: 'formation',
      deliveryMode: 'cohort',
    })
    const courseId = (await courseResponse.json<{ course: { id: string } }>())
      .course.id
    expect(
      (
        await request(
          'POST',
          `/api/courses/church_demo/${courseId}/enrollments`,
          { personId: leaves.id, status: 'active' },
        )
      ).status,
    ).toBe(201)

    const deleted = await request(
      'DELETE',
      `/api/people/church_demo/${leaves.id}`,
      { version: leaves.version },
    )
    expect(deleted.status).toBe(204)

    const after = await readRegister(register)
    expect(after.entries.map((entry) => entry.personId)).not.toContain(
      leaves.id,
    )
    expect(after).toMatchObject({ presentCount: 1, recordedCount: 1 })
    const correction = await request('PUT', `${register}/${leaves.id}`, {
      version: 1,
      status: 'absent',
    })
    expect(correction.status).toBe(404)

    const enrollments = await (
      await request('GET', `/api/courses/church_demo/${courseId}/enrollments`)
    ).json<{ enrollments: CourseEnrollment[] }>()
    expect(enrollments.enrollments).toEqual([])

    const stored = await env.DB.prepare(
      `
        SELECT
          (SELECT COUNT(*) FROM attendance_records WHERE person_id = ?1) AS marks,
          (SELECT COUNT(*) FROM course_enrollments WHERE person_id = ?1) AS enrollments
      `,
    )
      .bind(leaves.id)
      .first<{ marks: number; enrollments: number }>()
    expect(stored).toEqual({ marks: 1, enrollments: 1 })
    expect(groupId).toBeTruthy()
  })
})

describe('course completion history', () => {
  it('keeps the completion date through notes-only edits and archiving, and clears it on reopening', async () => {
    const courseResponse = await request('POST', '/api/courses/church_demo', {
      slug: 'hist-completion-course',
      title: 'Completion course',
      courseType: 'formation',
      deliveryMode: 'cohort',
    })
    const courseId = (await courseResponse.json<{ course: { id: string } }>())
      .course.id
    const graduate = await createPerson('Course', 'Graduate')
    const base = `/api/courses/church_demo/${courseId}/enrollments`
    const created = await (
      await request('POST', base, { personId: graduate.id, status: 'active' })
    ).json<{ enrollments: CourseEnrollment[] }>()
    const enrollment = created.enrollments[0]!

    async function update(version: number, body: Record<string, unknown>) {
      const response = await request('PATCH', `${base}/${enrollment.id}`, {
        version,
        ...body,
      })
      expect(response.status).toBe(200)
      return (await response.json<{ enrollments: CourseEnrollment[] }>())
        .enrollments[0]!
    }

    const completed = await update(enrollment.version, { status: 'completed' })
    expect(completed.completedAt).toBeTypeOf('number')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const noted = await update(completed.version, {
      status: 'completed',
      notes: 'Certificate sent',
    })
    expect(noted.completedAt).toBe(completed.completedAt)
    const archived = await update(noted.version, { status: 'archived' })
    expect(archived.completedAt).toBe(completed.completedAt)
    const reopened = await update(archived.version, { status: 'active' })
    expect(reopened.completedAt).toBeUndefined()
  })
})
