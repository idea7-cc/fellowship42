import { afterAll, afterEach, expect, it, vi } from 'vitest'

/*
 * Completion dates are instants shown as a calendar day in the viewer's
 * timezone, like other staff activity times. Pin the viewer's zone before any
 * module that captures it loads, so the expected day holds on every machine.
 */
const viewerZone = vi.hoisted(() => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Chicago'
  return { previous }
})

import { CourseEnrollmentPanel } from '../../src/components/course-enrollment-panel'
import { GroupRosterPanel } from '../../src/components/group-roster-panel'
import { GroupSessionsPanel } from '../../src/components/group-sessions-panel'
import type {
  AttendanceEntry,
  Group,
  GroupSession,
  SessionAttendance,
} from '../../contracts/api'
import { mountStaff, stubApi } from './staff-harness'

type Ui = Awaited<ReturnType<typeof mountStaff>>
let ui: Ui | null = null
afterEach(async () => {
  await ui?.unmount()
  ui = null
})
afterAll(() => {
  if (viewerZone.previous === undefined) delete process.env.TZ
  else process.env.TZ = viewerZone.previous
})

const group = { id: 'group', title: 'Midtown', location: 'Hall' } as Group
const session: GroupSession = {
  id: 'session',
  groupId: 'group',
  title: 'Past week',
  status: 'submitted',
  startsAt: Date.UTC(2026, 8, 20, 23),
  version: 2,
}

function entry(
  personId: string,
  firstName: string,
  extra: Partial<AttendanceEntry>,
): AttendanceEntry {
  return {
    version: 0,
    personId,
    firstName,
    lastName: 'Member',
    membershipStatus: 'member',
    ...extra,
  }
}

async function openRegister(attendance: SessionAttendance) {
  const api = stubApi((call) => {
    if (call.method === 'PUT') return Response.json(attendance)
    if (call.path.endsWith('/attendance')) return Response.json(attendance)
    return Response.json({ sessions: [session] })
  })
  ui = await mountStaff(
    <GroupSessionsPanel churchId="church" group={group} onClose={() => {}} />,
  )
  await ui.click(ui.button(/Past week/))
  return api
}

it('shows recorded marks for people who completed or left the group, with their roster state', async () => {
  const api = await openRegister({
    session,
    entries: [
      entry('gone', 'Gone', { status: 'present', version: 1 }),
      entry('done', 'Done', {
        status: 'present',
        rosterStatus: 'completed',
        version: 1,
      }),
      entry('here', 'Still', {
        status: 'absent',
        rosterStatus: 'active',
        version: 1,
      }),
    ],
    presentCount: 2,
    recordedCount: 3,
  })
  const text = ui!.text()
  expect(text).toContain('2 present · 3 of 3 recorded')
  expect(text).toContain('No longer in group')
  expect(text).toContain('Completed')
  const gone = ui!.container.querySelector<HTMLSelectElement>(
    '[aria-label="Attendance for Gone Member"]',
  )!
  expect(gone.value).toBe('present')
  expect(gone.disabled).toBe(false)
  expect(ui!.button('Mark rest present').disabled).toBe(true)

  await ui!.type(gone, 'excused')
  const corrections = api.requests('PUT', '/attendance/gone')
  expect(corrections).toHaveLength(1)
  expect(corrections[0]!.body).toMatchObject({ status: 'excused', version: 1 })
})

it('explains an empty register without implying marks were never recorded', async () => {
  await openRegister({
    session,
    entries: [],
    presentCount: 0,
    recordedCount: 0,
  })
  expect(ui!.text()).toContain('Nobody is recorded for this session')
  expect(ui!.text()).not.toContain('No active members')
})

it('tells staff that removing a member keeps their recorded attendance', async () => {
  stubApi((call) => {
    if (call.path.endsWith('/roster'))
      return Response.json({
        members: [
          {
            id: 'membership',
            groupId: 'group',
            personId: 'p1',
            firstName: 'Pat',
            lastName: 'Member',
            status: 'active',
            version: 1,
          },
        ],
        leaders: [],
        activeCount: 1,
      })
    return Response.json({ people: [] })
  })
  ui = await mountStaff(
    <GroupRosterPanel churchId="church" group={group} onClose={() => {}} />,
  )
  expect(ui.text()).toContain('Recorded attendance is kept')
})

it('shows when an archived enrollment was completed', async () => {
  stubApi((call) => {
    if (call.path.endsWith('/enrollments'))
      return Response.json({
        enrollments: [
          {
            version: 3,
            id: 'enrollment',
            courseId: 'course',
            status: 'archived',
            personId: 'p1',
            subjectName: 'Tabitha Okoro',
            startedAt: Date.UTC(2026, 2, 1, 12),
            completedAt: Date.UTC(2026, 4, 20, 12),
          },
        ],
      })
    if (call.path.startsWith('/api/people/'))
      return Response.json({ people: [] })
    return Response.json({ groups: [] })
  })
  ui = await mountStaff(
    <CourseEnrollmentPanel
      churchId="church"
      courseId="course"
      courseTitle="Baptism Class"
    />,
  )
  expect(ui.text()).toContain('Completed May 20, 2026')
})
