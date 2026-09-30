import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { GroupSessionsPanel } from '../../src/components/group-sessions-panel'
import { TeamMembersPanel } from '../../src/components/team-members-panel'
import { CourseDetailPage } from '../../src/routes/course-detail'
import { CoursesPage } from '../../src/routes/courses'
import { EventsPage } from '../../src/routes/events'
import { GroupsPage } from '../../src/routes/groups'
import { ManagementPage } from '../../src/routes/management'
import { PeoplePage } from '../../src/routes/people'
import { SermonsPage } from '../../src/routes/sermons'
import type {
  Course,
  EventRecord,
  Group,
  Household,
  Lesson,
  MediaRecord,
  PersonDetail,
  Sermon,
  TeamMember,
  TeamRole,
} from '../../contracts/api'
import {
  apiError,
  flush,
  mountStaff,
  stubApi,
  type RecordedCall,
} from './staff-harness'

/*
 * Switching from one record to another must never carry the first record's
 * values, or the completion of a request made for the first record, into the
 * editor that is now open. Fixtures differ in every control type so a carried
 * value is visible.
 */

type Ui = Awaited<ReturnType<typeof mountStaff>>

let ui: Ui | null = null
afterEach(async () => {
  await ui?.unmount()
  ui = null
})

const church = {
  church: { id: 'church', name: 'Grace', timezone: 'America/Chicago' },
}

function group(id: string, title: string, extra: Partial<Group> = {}): Group {
  return {
    id,
    churchId: 'church',
    slug: id,
    title,
    status: 'draft',
    groupType: 'Small group',
    audience: `${title} audience`,
    schedule: `${title} schedule`,
    location: `${title} hall`,
    enrollmentPolicy: 'closed',
    openEnrollment: false,
    featured: false,
    summary: `${title} summary`,
    version: 5,
    ...extra,
  }
}
const groupA = group('group-a', 'Alpha', {
  status: 'published',
  featured: true,
  enrollmentPolicy: 'open',
  version: 3,
})
const groupB = group('group-b', 'Beta')

function course(id: string, title: string, extra: Partial<Course> = {}) {
  return {
    id,
    churchId: 'church',
    slug: id,
    title,
    status: 'draft',
    courseType: `${title} type`,
    deliveryMode: 'in-person',
    audience: '',
    duration: '',
    featured: false,
    certificateOffered: false,
    summary: `${title} summary`,
    lessonCount: 0,
    version: 5,
    ...extra,
  } satisfies Course
}

function event(id: string, title: string, extra: Partial<EventRecord> = {}) {
  return {
    id,
    churchId: 'church',
    slug: id,
    title,
    status: 'draft',
    summary: `${title} summary`,
    startDate: Date.UTC(2026, 9, 20, 15),
    timezone: 'America/Chicago',
    location: `${title} location`,
    featured: false,
    version: 5,
    ...extra,
  } satisfies EventRecord
}

function sermon(id: string, title: string, extra: Partial<Sermon> = {}) {
  return {
    id,
    churchId: 'church',
    slug: id,
    title,
    status: 'draft',
    speaker: `${title} speaker`,
    summary: `${title} summary`,
    preachedAt: Date.UTC(2026, 8, 20, 12),
    featured: false,
    version: 5,
    ...extra,
  } satisfies Sermon
}

function person(id: string, firstName: string, extra = {}): PersonDetail {
  return {
    id,
    churchId: 'church',
    firstName,
    lastName: 'Doe',
    email: `${firstName.toLowerCase()}@example.test`,
    membershipStatus: 'guest',
    volunteerReady: false,
    version: 5,
    ...extra,
  }
}
const ann = person('person-a', 'Ann', {
  membershipStatus: 'member',
  volunteerReady: true,
  notes: 'Ann private care note',
  version: 3,
})
const ben = person('person-b', 'Ben', { notes: 'Ben note' })

function household(id: string, name: string, city: string, version: number) {
  return {
    id,
    churchId: 'church',
    name,
    address: { city, countryCode: id === 'h1' ? 'CA' : 'US' },
    members: [],
    version,
  } satisfies Household
}

function lesson(id: string, title: string, extra: Partial<Lesson> = {}) {
  return {
    id,
    courseId: 'course-a',
    title,
    summary: `${title} summary`,
    content: `${title} content`,
    required: true,
    sortOrder: 2,
    version: 5,
    ...extra,
  } satisfies Lesson
}

function directoryRoutes(
  extra: (call: RecordedCall) => Response | 'defer' | undefined = () =>
    undefined,
) {
  return (call: RecordedCall) => {
    const answer = extra(call)
    if (answer) return answer
    if (call.method === 'PATCH') return Response.json({})
    if (call.path === '/api/people/church/person-a')
      return Response.json({ person: ann })
    if (call.path === '/api/people/church/person-b')
      return Response.json({ person: ben })
    if (call.path.startsWith('/api/people/church?'))
      return Response.json({
        people: [ann, ben],
        page: { limit: 12, nextCursor: null },
      })
    if (call.path.startsWith('/api/households/church?'))
      return Response.json({
        households: [
          household('h1', 'Smiths', 'Austin', 3),
          household('h2', 'Joneses', 'Boston', 5),
        ],
        page: { limit: 12, nextCursor: null },
      })
    return Response.json(church)
  }
}

interface FieldExpectation {
  name: string
  checked?: boolean
  value?: string
}

interface SwitchCase {
  name: string
  node: ReactNode
  path?: string
  route?: string
  routes: (call: RecordedCall) => Response | 'defer' | undefined
  prepare?: (ui: Ui) => Promise<void>
  openA: (ui: Ui) => Promise<void>
  openB: (ui: Ui) => Promise<void>
  heading: { a: string; b: string }
  typeInto: string
  fields: FieldExpectation[]
  patchPath: string
  patchBody: Record<string, unknown>
}

function listing(
  fragment: string,
  body: Record<string, unknown>,
): (call: RecordedCall) => Response | undefined {
  return (call) => {
    if (call.method === 'PATCH') return Response.json({})
    if (call.path.startsWith(fragment)) return Response.json(body)
    if (call.path.startsWith('/api/media/')) return Response.json({ media: [] })
    return Response.json(church)
  }
}

const switchCases: SwitchCase[] = [
  {
    name: 'people',
    node: <PeoplePage />,
    routes: directoryRoutes(),
    openA: (ui) => ui.click(ui.button('Edit Ann Doe')),
    openB: (ui) => ui.click(ui.button('Edit Ben Doe')),
    heading: { a: 'Edit Ann Doe', b: 'Edit Ben Doe' },
    typeInto: 'phone',
    fields: [
      { name: 'firstName', value: 'Ben' },
      { name: 'email', value: 'ben@example.test' },
      { name: 'membershipStatus', value: 'guest' },
      { name: 'volunteerReady', checked: false },
      { name: 'notes', value: 'Ben note' },
    ],
    patchPath: '/api/people/church/person-b',
    patchBody: {
      version: 5,
      firstName: 'Ben',
      membershipStatus: 'guest',
      volunteerReady: false,
      notes: 'Ben note',
    },
  },
  {
    name: 'households',
    node: <PeoplePage />,
    routes: directoryRoutes(),
    prepare: (ui) => ui.click(ui.button('Households')),
    openA: (ui) => ui.click(ui.button('Edit Smiths')),
    openB: (ui) => ui.click(ui.button('Edit Joneses')),
    heading: { a: 'Edit Smiths', b: 'Edit Joneses' },
    typeInto: 'street',
    fields: [
      { name: 'name', value: 'Joneses' },
      { name: 'city', value: 'Boston' },
      { name: 'countryCode', value: 'US' },
    ],
    patchPath: '/api/households/church/h2',
    patchBody: { version: 5, name: 'Joneses', city: 'Boston' },
  },
  {
    name: 'groups',
    node: <GroupsPage />,
    routes: listing('/api/groups/church?', {
      groups: [groupA, groupB],
      page: { limit: 24, nextCursor: null },
    }),
    openA: (ui) => ui.click(ui.button('Edit', 0)),
    openB: (ui) => ui.click(ui.button('Edit', 1)),
    heading: { a: 'Edit Alpha', b: 'Edit Beta' },
    typeInto: 'audience',
    fields: [
      { name: 'title', value: 'Beta' },
      { name: 'status', value: 'draft' },
      { name: 'featured', checked: false },
      { name: 'summary', value: 'Beta summary' },
    ],
    patchPath: '/api/groups/church/group-b',
    patchBody: {
      version: 5,
      slug: 'group-b',
      title: 'Beta',
      status: 'draft',
      featured: false,
    },
  },
  {
    name: 'courses',
    node: <CoursesPage />,
    routes: listing('/api/courses/church?', {
      courses: [
        course('course-a', 'Alpha', {
          status: 'published',
          certificateOffered: true,
          version: 3,
        }),
        course('course-b', 'Beta'),
      ],
    }),
    openA: (ui) => ui.click(ui.button('Edit', 0)),
    openB: (ui) => ui.click(ui.button('Edit', 1)),
    heading: { a: 'Edit Alpha', b: 'Edit Beta' },
    typeInto: 'audience',
    fields: [
      { name: 'title', value: 'Beta' },
      { name: 'status', value: 'draft' },
      { name: 'certificateOffered', checked: false },
      { name: 'summary', value: 'Beta summary' },
    ],
    patchPath: '/api/courses/church/course-b',
    patchBody: {
      version: 5,
      slug: 'course-b',
      title: 'Beta',
      certificateOffered: false,
    },
  },
  {
    name: 'events',
    node: <EventsPage />,
    routes: listing('/api/events/church?', {
      events: [
        event('event-a', 'Alpha', {
          status: 'published',
          featured: true,
          startDate: Date.UTC(2026, 9, 1, 14),
          version: 3,
        }),
        event('event-b', 'Beta'),
      ],
    }),
    openA: (ui) => ui.click(ui.button('Edit', 0)),
    openB: (ui) => ui.click(ui.button('Edit', 1)),
    heading: { a: 'Edit Alpha', b: 'Edit Beta' },
    typeInto: 'location',
    fields: [
      { name: 'title', value: 'Beta' },
      { name: 'status', value: 'draft' },
      { name: 'featured', checked: false },
      { name: 'summary', value: 'Beta summary' },
    ],
    patchPath: '/api/events/church/event-b',
    patchBody: {
      version: 5,
      slug: 'event-b',
      title: 'Beta',
      featured: false,
      startsAt: Date.UTC(2026, 9, 20, 15),
    },
  },
  {
    name: 'sermons',
    node: <SermonsPage />,
    routes: listing('/api/sermons/church?', {
      sermons: [
        sermon('sermon-a', 'Alpha', {
          status: 'published',
          featured: true,
          version: 3,
        }),
        sermon('sermon-b', 'Beta'),
      ],
    }),
    openA: (ui) => ui.click(ui.button('Edit', 0)),
    openB: (ui) => ui.click(ui.button('Edit', 1)),
    heading: { a: 'Edit Alpha', b: 'Edit Beta' },
    typeInto: 'series',
    fields: [
      { name: 'title', value: 'Beta' },
      { name: 'status', value: 'draft' },
      { name: 'featured', checked: false },
      { name: 'summary', value: 'Beta summary' },
    ],
    patchPath: '/api/sermons/church/sermon-b',
    patchBody: { version: 5, slug: 'sermon-b', title: 'Beta', featured: false },
  },
  {
    name: 'lessons',
    node: <CourseDetailPage />,
    path: '/app/courses/course-a',
    route: '/app/courses/:slug',
    routes: (call) => {
      if (call.method === 'PATCH') return Response.json({})
      if (call.path === '/api/courses/church/course-a')
        return Response.json({
          course: course('course-a', 'Course A', { lessonCount: 2 }),
          lessons: [
            lesson('l1', 'L1', { required: false, sortOrder: 1, version: 3 }),
            lesson('l2', 'L2'),
          ],
        })
      if (call.path.endsWith('/enrollments'))
        return Response.json({ enrollments: [] })
      if (call.path.startsWith('/api/people/'))
        return Response.json({ people: [] })
      if (call.path.startsWith('/api/groups/'))
        return Response.json({ groups: [] })
      if (call.path.startsWith('/api/media/'))
        return Response.json({ media: [] })
      return Response.json(church)
    },
    openA: (ui) => ui.click(ui.button('Edit', 0)),
    openB: (ui) => ui.click(ui.button('Edit', 1)),
    heading: { a: 'Edit L1', b: 'Edit L2' },
    typeInto: 'estimatedMinutes',
    fields: [
      { name: 'title', value: 'L2' },
      { name: 'sortOrder', value: '2' },
      { name: 'required', checked: true },
      { name: 'content', value: 'L2 content' },
    ],
    patchPath: '/api/courses/church/course-a/lessons/l2',
    patchBody: { version: 5, title: 'L2', required: true, sortOrder: 2 },
  },
]

function readField(form: HTMLFormElement, name: string) {
  const element = form.querySelector<HTMLInputElement>(`[name="${name}"]`)
  if (!element) throw new Error(`No field ${name}`)
  return element
}

describe('switching editors between records', () => {
  for (const testCase of switchCases) {
    it(`${testCase.name}: opening B after editing A shows and saves only B`, async () => {
      const api = stubApi(testCase.routes)
      ui = await mountStaff(testCase.node, {
        path: testCase.path,
        route: testCase.route,
      })
      await testCase.prepare?.(ui)
      await testCase.openA(ui)
      const formA = ui.formWith(testCase.typeInto)
      await ui.type(readField(formA, testCase.typeInto), 'Typed for A')
      await testCase.openB(ui)

      expect(ui.text()).toContain(testCase.heading.b)
      expect(ui.text()).not.toContain(testCase.heading.a)
      const form = ui.formWith(testCase.typeInto)
      expect(readField(form, testCase.typeInto).value).not.toBe('Typed for A')
      for (const field of testCase.fields) {
        const element = readField(form, field.name)
        if (field.checked !== undefined) {
          expect(element.checked, field.name).toBe(field.checked)
        } else {
          expect(element.value, field.name).toBe(field.value)
        }
      }

      await ui.submit(form)
      const patches = api.requests('PATCH')
      expect(patches).toHaveLength(1)
      expect(patches[0]!.path).toBe(testCase.patchPath)
      expect(patches[0]!.body).toMatchObject(testCase.patchBody)
      expect(JSON.stringify(patches[0]!.body)).not.toContain('Typed for A')
    })
  }

  it('people: a new-person draft does not carry into the next edit', async () => {
    const api = stubApi(directoryRoutes())
    ui = await mountStaff(<PeoplePage />)
    await ui.click(ui.button('Add person'))
    await ui.type(ui.field('firstName', ui.form()), 'NewVisitor')
    await ui.click(ui.button('Edit Ann Doe'))
    const form = ui.form()
    expect(ui.text()).toContain('Edit Ann Doe')
    expect(readField(form, 'firstName').value).toBe('Ann')
    expect(readField(form, 'membershipStatus').value).toBe('member')
    expect(readField(form, 'volunteerReady').checked).toBe(true)
    await ui.submit(form)
    expect(api.requests('PATCH')[0]!.body).toMatchObject({
      version: 3,
      firstName: 'Ann',
      membershipStatus: 'member',
      volunteerReady: true,
    })
  })

  it('course route: an open lesson editor does not follow the page to another course', async () => {
    const api = stubApi((call) => {
      if (call.method === 'PATCH') return Response.json({})
      if (call.path === '/api/courses/church/course-a')
        return Response.json({
          course: course('course-a', 'Course A'),
          lessons: [lesson('l1', 'L1')],
        })
      if (call.path === '/api/courses/church/course-b')
        return Response.json({
          course: course('course-b', 'Course B'),
          lessons: [lesson('l9', 'L9', { courseId: 'course-b' })],
        })
      if (call.path.endsWith('/enrollments'))
        return Response.json({ enrollments: [] })
      if (call.path.startsWith('/api/people/'))
        return Response.json({ people: [] })
      if (call.path.startsWith('/api/groups/'))
        return Response.json({ groups: [] })
      if (call.path.startsWith('/api/media/'))
        return Response.json({ media: [] })
      return Response.json(church)
    })
    ui = await mountStaff(<CourseDetailPage />, {
      path: '/app/courses/course-a',
      route: '/app/courses/:slug',
    })
    await ui.click(ui.button('Edit'))
    expect(ui.text()).toContain('Edit L1')
    await ui.navigate('/app/courses/course-b')
    expect(ui.text()).toContain('Course B')
    expect(ui.text()).not.toContain('Edit L1')
    expect(ui.container.querySelector('[name="content"]')).toBeNull()
    expect(api.requests('PATCH')).toHaveLength(0)
  })

  it('group sessions: a create draft for one group is not posted to another', async () => {
    const api = stubApi((call) => {
      if (call.method === 'POST')
        return Response.json({ sessions: [] }, { status: 201 })
      if (call.path.endsWith('/sessions'))
        return Response.json({ sessions: [] })
      if (call.path.startsWith('/api/groups/church?'))
        return Response.json({
          groups: [groupA, groupB],
          page: { limit: 24, nextCursor: null },
        })
      return Response.json(church)
    })
    ui = await mountStaff(<GroupsPage />)
    await ui.click(ui.button('Sessions', 0))
    await ui.click(ui.button('Add session', 0))
    await ui.type(ui.field('title', ui.form()), 'Alpha retreat')
    await ui.click(ui.button('Sessions', 1))
    expect(ui.text()).toContain('Sessions — Beta')
    const forms = Array.from(ui.container.querySelectorAll('form')).filter(
      (form) => form.querySelector('[name="startsAt"]'),
    )
    for (const form of forms) {
      expect(readField(form, 'title').value).not.toBe('Alpha retreat')
      expect(readField(form, 'location').value).toBe('Beta hall')
    }
    expect(api.requests('POST')).toHaveLength(0)
  })

  it('management: a support decision reason belongs to one request', async () => {
    const supportSession = (id: string, who: string, state: string) => ({
      requestId: id,
      connectionId: 'connection',
      reason: `${who} diagnostics`,
      requestedMinutes: 30,
      scope: 'operational-diagnostics',
      supportOperator: { id: who, displayName: who },
      state,
      requestedAt: '2026-09-30T00:00:00Z',
      decisionDueAt: '2026-09-30T01:00:00Z',
      approvedAt: null,
      expiresAt: state === 'approved' ? '2026-09-30T02:00:00Z' : null,
      revokedAt: null,
      decisionReason: null,
    })
    const api = stubApi((call) => {
      if (call.method === 'POST') return Response.json({})
      if (call.path === '/api/management/updates')
        return Response.json({ preparations: [] })
      if (call.path === '/api/management')
        return Response.json({
          instanceId: 'instance',
          enabled: true,
          identity: null,
          pendingEnrollment: null,
          lastDisposition: null,
          supportSessions: [
            supportSession('s1', 'OpA', 'awaiting-local-approval'),
            supportSession('s2', 'OpB', 'approved'),
          ],
          connection: {
            connectionId: 'connection',
            operator: {
              id: 'operator',
              displayName: 'Operator',
              keyId: 'key',
              keyFingerprint: 'fingerprint-0123456789',
            },
            grantVersion: 1,
            rotationPending: false,
            grants: [],
            approvedAt: '2026-09-01T00:00:00Z',
            lastSyncAt: null,
            lastSyncStatus: null,
            lastSyncCode: null,
          },
        })
      return Response.json({})
    })
    ui = await mountStaff(<ManagementPage />)
    const reasons = () =>
      Array.from(ui!.container.querySelectorAll('label'))
        .filter((label) =>
          label.textContent?.startsWith('Reason for rejection'),
        )
        .map((label) => label.querySelector('input')!)
    expect(reasons()).toHaveLength(2)
    await ui.type(reasons()[0]!, 'OpA looks unfamiliar')
    expect(reasons()[1]!.value).toBe('')
    expect(ui.button('Revoke now').disabled).toBe(true)
    expect(ui.button('Reject request').disabled).toBe(false)
    await ui.click(ui.button('Reject request'))
    const decisions = api.requests('POST', '/decision')
    expect(decisions).toHaveLength(1)
    expect(decisions[0]!.path).toContain('/s1/')
    expect(decisions[0]!.body).toEqual({
      action: 'reject',
      reason: 'OpA looks unfamiliar',
    })
  })
})

describe('outstanding requests completing after a switch', () => {
  it('people: a slow detail load for A does not replace the B editor', async () => {
    const api = stubApi(
      directoryRoutes((call) =>
        call.method === 'GET' &&
        (call.path === '/api/people/church/person-a' ||
          call.path === '/api/people/church/person-b')
          ? 'defer'
          : undefined,
      ),
    )
    ui = await mountStaff(<PeoplePage />)
    await ui.click(ui.button('Edit Ann Doe'))
    await ui.click(ui.button('Edit Ben Doe'))
    api.held('GET', 'person-b').resolve(Response.json({ person: ben }))
    await flushHeld()
    expect(ui.text()).toContain('Edit Ben Doe')
    await ui.type(ui.field('phone', ui.form()), '555-0100')
    api.held('GET', 'person-a').resolve(Response.json({ person: ann }))
    await flushHeld()
    expect(ui.text()).toContain('Edit Ben Doe')
    expect(ui.text()).not.toContain('Edit Ann Doe')
    expect(ui.field('phone', ui.form()).value).toBe('555-0100')
    expect(ui.alert()).toBeNull()
  })

  it('people: choosing Add person while A is loading keeps the new-person form', async () => {
    const api = stubApi(
      directoryRoutes((call) =>
        call.method === 'GET' && call.path === '/api/people/church/person-a'
          ? 'defer'
          : undefined,
      ),
    )
    ui = await mountStaff(<PeoplePage />)
    await ui.click(ui.button('Edit Ann Doe'))
    await ui.click(ui.button('Add person'))
    api.held('GET', 'person-a').resolve(Response.json({ person: ann }))
    await flushHeld()
    expect(ui.text()).toContain('Add a person')
    expect(ui.text()).not.toContain('Edit Ann Doe')
  })

  for (const outcome of ['saved', 'conflict'] as const) {
    it(`groups: A's save completing (${outcome}) leaves the B editor open and usable`, async () => {
      const api = stubApi((call) => {
        if (call.method === 'PATCH') return 'defer'
        if (call.path.startsWith('/api/groups/church?'))
          return Response.json({
            groups: [groupA, groupB],
            page: { limit: 24, nextCursor: null },
          })
        return Response.json(church)
      })
      ui = await mountStaff(<GroupsPage />)
      await ui.click(ui.button('Edit', 0))
      await ui.submit(ui.form())
      await ui.click(ui.button('Edit', 1))
      const submitB = () =>
        ui!.form().querySelector<HTMLButtonElement>('button[type="submit"]')!
      expect(submitB().disabled).toBe(false)
      expect(submitB().textContent).toBe('Save group')
      await ui.type(ui.field('summary', ui.form()), 'Unsaved Beta summary')
      const listReads = api.requests('GET', '/api/groups/church?').length
      api
        .held('PATCH', 'group-a')
        .resolve(
          outcome === 'saved'
            ? Response.json({ group: groupA })
            : apiError(409, 'version_conflict', 'Alpha changed elsewhere'),
        )
      await flushHeld()
      expect(ui.text()).toContain('Edit Beta')
      expect(ui.field('summary', ui.form()).value).toBe('Unsaved Beta summary')
      expect(submitB().disabled).toBe(false)
      expect(ui.alert()).toBeNull()
      if (outcome === 'saved') {
        expect(
          api.requests('GET', '/api/groups/church?').length,
        ).toBeGreaterThan(listReads)
      }
    })
  }

  it('people: A save completing after switching keeps the B editor', async () => {
    const api = stubApi(
      directoryRoutes((call) =>
        call.method === 'PATCH' ? 'defer' : undefined,
      ),
    )
    ui = await mountStaff(<PeoplePage />)
    await ui.click(ui.button('Edit Ann Doe'))
    await ui.submit(ui.form())
    await ui.click(ui.button('Edit Ben Doe'))
    await ui.type(ui.field('phone', ui.form()), '555-0199')
    api.held('PATCH', 'person-a').resolve(Response.json({ person: ann }))
    await flushHeld()
    expect(ui.text()).toContain('Edit Ben Doe')
    expect(ui.field('phone', ui.form()).value).toBe('555-0199')
  })

  it('roster: a conflict for A arriving after switching does not appear on B', async () => {
    const api = stubApi((call) => {
      if (call.method === 'DELETE') return 'defer'
      if (call.path.endsWith('/roster'))
        return Response.json({
          members: call.path.includes('group-a')
            ? [
                {
                  id: 'membership',
                  groupId: 'group-a',
                  personId: 'p1',
                  firstName: 'Pat',
                  lastName: 'Alpha',
                  status: 'active',
                  version: 1,
                },
              ]
            : [],
          leaders: [],
          activeCount: 1,
        })
      if (call.path.startsWith('/api/people/'))
        return Response.json({ people: [] })
      if (call.path.startsWith('/api/groups/church?'))
        return Response.json({
          groups: [groupA, groupB],
          page: { limit: 24, nextCursor: null },
        })
      return Response.json(church)
    })
    ui = await mountStaff(<GroupsPage />)
    await ui.click(ui.button('Roster', 0))
    await ui.click(ui.button('Remove Pat Alpha from group'))
    await ui.click(ui.button('Roster', 1))
    api
      .held('DELETE')
      .resolve(apiError(409, 'version_conflict', 'Alpha roster changed'))
    await flushHeld()
    expect(ui.text()).toContain('Roster — Beta')
    expect(ui.alert()).toBeNull()
    for (const button of ui.form(0).querySelectorAll('button')) {
      expect(button.disabled).toBe(false)
    }
  })

  it('sessions: A create completing after switching keeps the B draft', async () => {
    const api = stubApi((call) => {
      if (call.method === 'POST') return 'defer'
      if (call.path.endsWith('/sessions'))
        return Response.json({ sessions: [] })
      if (call.path.startsWith('/api/groups/church?'))
        return Response.json({
          groups: [groupA, groupB],
          page: { limit: 24, nextCursor: null },
        })
      return Response.json(church)
    })
    ui = await mountStaff(<GroupsPage />)
    await ui.click(ui.button('Sessions', 0))
    await ui.click(ui.button('Add session', 0))
    await ui.submit(ui.form())
    await ui.click(ui.button('Sessions', 1))
    await ui.click(ui.button('Add session', 0))
    await ui.type(ui.field('title', ui.form()), 'Beta planning night')
    api
      .held('POST', 'group-a')
      .resolve(Response.json({ sessions: [] }, { status: 201 }))
    await flushHeld()
    expect(ui.text()).toContain('Sessions — Beta')
    expect(ui.field('title', ui.form()).value).toBe('Beta planning night')
    expect(ui.alert()).toBeNull()
  })

  it('team: role edits submit the version the editor showed', async () => {
    const roles: TeamRole[] = ['owner', 'finance', 'pastor'].map((key) => ({
      key,
      name: key[0]!.toUpperCase() + key.slice(1),
      description: '',
      permissions: [],
      isSystem: true,
    }))
    let serverVersion = 1
    const member = (): TeamMember => ({
      membershipId: 'm1',
      userId: 'u1',
      email: 'ann@example.test',
      firstName: 'Ann',
      lastName: 'Team',
      accountStatus: 'active',
      membershipStatus: 'active',
      roleKeys: serverVersion === 1 ? ['finance'] : ['pastor'],
      version: serverVersion,
    })
    const api = stubApi((call) => {
      if (call.method === 'PATCH')
        return apiError(409, 'version_conflict', 'Roles changed elsewhere')
      return Response.json({ members: [member()], roles })
    })
    ui = await mountStaff(<TeamMembersPanel churchId="church" />)
    await ui.click(ui.button('Edit roles for Ann Team'))
    const editor = () =>
      Array.from(ui!.container.querySelectorAll('form')).find((form) =>
        form.textContent?.includes('Save roles'),
      )!
    const box = (key: string) =>
      editor().querySelector<HTMLInputElement>(`input[value="${key}"]`)!
    await ui.click(box('owner'))
    serverVersion = 2
    window.dispatchEvent(new CustomEvent('f42:invalidate'))
    await flushHeld()
    expect(box('owner').checked).toBe(true)
    expect(box('finance').checked).toBe(true)
    await ui.submit(editor())
    expect(api.requests('PATCH')[0]!.body).toEqual({
      version: 1,
      roleKeys: ['owner', 'finance'],
    })
    expect(ui.alert()).toContain('Roles changed elsewhere')
    expect(box('owner').checked).toBe(true)

    await ui.click(ui.button('Load latest roles'))
    expect(box('pastor').checked).toBe(true)
    expect(box('owner').checked).toBe(false)
    await ui.submit(editor())
    expect(api.requests('PATCH')[1]!.body).toEqual({
      version: 2,
      roleKeys: ['pastor'],
    })
  })
})

describe('editor fields that depend on later data', () => {
  const audio = (id: string): MediaRecord => ({
    id,
    churchId: 'church',
    mediaType: 'audio',
    contentType: 'audio/mpeg',
    byteSize: 10,
    altText: `${id} audio`,
    visibility: 'public',
    createdAt: 0,
    version: 1,
  })

  it('sermons: the saved audio stays selected when media arrives after the editor opens', async () => {
    const api = stubApi((call) => {
      if (call.method === 'PATCH') return Response.json({})
      if (call.path.startsWith('/api/sermons/church?'))
        return Response.json({
          sermons: [sermon('sermon-a', 'Hope', { audioMediaId: 'aud-1' })],
        })
      if (call.path.startsWith('/api/media/')) return 'defer'
      return Response.json(church)
    })
    ui = await mountStaff(<SermonsPage />)
    await ui.click(ui.button('Edit'))
    api
      .held('GET', '/api/media/')
      .resolve(Response.json({ media: [audio('aud-1'), audio('aud-2')] }))
    await flushHeld()
    expect(ui.field<HTMLSelectElement>('audioMediaId', ui.form()).value).toBe(
      'aud-1',
    )
    await ui.submit(ui.form())
    expect(api.requests('PATCH')[0]!.body).toMatchObject({
      audioMediaId: 'aud-1',
    })
  })

  it('sermons: audio outside the loaded media page is kept', async () => {
    const api = stubApi((call) => {
      if (call.method === 'PATCH') return Response.json({})
      if (call.path.startsWith('/api/sermons/church?'))
        return Response.json({
          sermons: [sermon('sermon-a', 'Hope', { audioMediaId: 'aud-old' })],
        })
      if (call.path.startsWith('/api/media/'))
        return Response.json({ media: [audio('aud-1')] })
      return Response.json(church)
    })
    ui = await mountStaff(<SermonsPage />)
    await ui.click(ui.button('Edit'))
    expect(ui.field<HTMLSelectElement>('audioMediaId', ui.form()).value).toBe(
      'aud-old',
    )
    await ui.submit(ui.form())
    expect(api.requests('PATCH')[0]!.body).toMatchObject({
      audioMediaId: 'aud-old',
    })
  })

  it('lessons: the saved media stays selected when media arrives after the editor opens', async () => {
    const api = stubApi((call) => {
      if (call.method === 'PATCH') return Response.json({})
      if (call.path === '/api/courses/church/course-a')
        return Response.json({
          course: course('course-a', 'Course A'),
          lessons: [lesson('l1', 'L1', { mediaId: 'doc-1' })],
        })
      if (call.path.endsWith('/enrollments'))
        return Response.json({ enrollments: [] })
      if (call.path.startsWith('/api/people/'))
        return Response.json({ people: [] })
      if (call.path.startsWith('/api/groups/'))
        return Response.json({ groups: [] })
      if (call.path.startsWith('/api/media/')) return 'defer'
      return Response.json(church)
    })
    ui = await mountStaff(<CourseDetailPage />, {
      path: '/app/courses/course-a',
      route: '/app/courses/:slug',
    })
    await ui.click(ui.button('Edit'))
    api.held('GET', '/api/media/').resolve(
      Response.json({
        media: [
          { ...audio('doc-1'), mediaType: 'document' },
          { ...audio('doc-2'), mediaType: 'document' },
        ],
      }),
    )
    await flushHeld()
    expect(
      ui.field<HTMLSelectElement>('mediaId', ui.formWith('mediaId')).value,
    ).toBe('doc-1')
    await ui.submit(ui.formWith('mediaId'))
    expect(api.requests('PATCH')[0]!.body).toMatchObject({ mediaId: 'doc-1' })
  })

  it('events: a new event uses the church timezone even when the church loads late', async () => {
    const api = stubApi((call) => {
      if (call.path.startsWith('/api/events/church?'))
        return Response.json({ events: [] })
      if (call.path === '/api/churches/church') return 'defer'
      return Response.json(church)
    })
    ui = await mountStaff(<EventsPage />)
    await ui.click(ui.button('Add event'))
    api.held('GET', '/api/churches/church').resolve(Response.json(church))
    await flushHeld()
    expect(ui.field('timezone', ui.form()).value).toBe('America/Chicago')
  })
})

async function flushHeld() {
  // Two turns: the held response resolves, then chained refetches settle.
  await flush()
  await flush()
}
