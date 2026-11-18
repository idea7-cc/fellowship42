import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'

/*
 * This file runs as a staff browser in Kiritimati (UTC+14), far from the
 * church and event zones below. Event times must still be read and shown in
 * the event's zone, and sermon dates must still round-trip as calendar dates.
 * The zone is set before any module that captures the default zone loads.
 */
const browserZone = vi.hoisted(() => {
  const previous = process.env.TZ
  process.env.TZ = 'Pacific/Kiritimati'
  return { previous }
})

import type {
  Contribution,
  EventRecord,
  Group,
  GroupSession,
  Sermon,
} from '../../contracts/api'
import { GroupSessionsPanel } from '../../src/components/group-sessions-panel'
import { ContributionsPage } from '../../src/routes/contributions'
import { EventsPage } from '../../src/routes/events'
import { SermonsPage } from '../../src/routes/sermons'
import { mountStaff, stubApi } from './staff-harness'

type Ui = Awaited<ReturnType<typeof mountStaff>>
let ui: Ui | null = null

beforeAll(() => {
  // Precondition: the browser really is fourteen hours ahead of UTC.
  expect(new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset()).toBe(-840)
})
afterEach(async () => {
  await ui?.unmount()
  ui = null
})
afterAll(() => {
  if (browserZone.previous === undefined) delete process.env.TZ
  else process.env.TZ = browserZone.previous
})

const church = {
  church: { id: 'church', name: 'Grace', timezone: 'America/Chicago' },
}

const autumnService: EventRecord = {
  id: 'event-autumn',
  churchId: 'church',
  slug: 'autumn-service',
  title: 'Autumn service',
  status: 'published',
  summary: 'Harvest worship',
  // 10:00 in Chicago (CDT, UTC-5).
  startDate: Date.UTC(2026, 9, 20, 15),
  endDate: Date.UTC(2026, 9, 20, 16, 30),
  timezone: 'America/Chicago',
  location: 'Sanctuary',
  featured: false,
  version: 4,
}

async function renderEvents(events: EventRecord[] = [autumnService]) {
  const api = stubApi((call) => {
    if (call.method === 'PATCH' || call.method === 'POST')
      return Response.json({}, { status: call.method === 'POST' ? 201 : 200 })
    if (call.path.startsWith('/api/events/church?'))
      return Response.json({ events })
    return Response.json(church)
  })
  ui = await mountStaff(<EventsPage />)
  return api
}

it('shows event times in the staff list in the event timezone', async () => {
  await renderEvents()
  expect(ui!.text()).toContain('Oct 20, 2026, 10:00 AM · America/Chicago')
})

it('edits an existing event in its own timezone and saves the same instant', async () => {
  const api = await renderEvents()
  await ui!.click(ui!.button('Edit'))
  const form = ui!.formWith('startsAt')
  expect(ui!.field('startsAt', form).value).toBe('2026-10-20T10:00')
  expect(ui!.field('endsAt', form).value).toBe('2026-10-20T11:30')
  expect(ui!.text()).toContain('America/Chicago')
  await ui!.submit(form)
  expect(api.requests('PATCH')[0]!.body).toMatchObject({
    startsAt: Date.UTC(2026, 9, 20, 15),
    endsAt: Date.UTC(2026, 9, 20, 16, 30),
    timezone: 'America/Chicago',
  })
})

it('keeps an unchanged time in the repeated daylight-saving hour', async () => {
  // 01:30 EST, the second 01:30 on the night New York falls back.
  const lateService: EventRecord = {
    ...autumnService,
    id: 'event-late',
    slug: 'late-service',
    title: 'Late service',
    startDate: Date.UTC(2026, 10, 1, 6, 30),
    endDate: Date.UTC(2026, 10, 1, 7),
    timezone: 'America/New_York',
  }
  const api = await renderEvents([lateService])
  await ui!.click(ui!.button('Edit'))
  const form = ui!.formWith('startsAt')
  expect(ui!.field('startsAt', form).value).toBe('2026-11-01T01:30')
  await ui!.type(ui!.field('title', form), 'Late vigil')
  await ui!.submit(form)
  expect(api.requests('PATCH')[0]!.body).toMatchObject({
    title: 'Late vigil',
    startsAt: Date.UTC(2026, 10, 1, 6, 30),
    endsAt: Date.UTC(2026, 10, 1, 7),
  })
})

it('reads a new event time in the church timezone, not the browser timezone', async () => {
  const api = await renderEvents([])
  await ui!.click(ui!.button('Add event'))
  const form = ui!.formWith('startsAt')
  await ui!.type(ui!.field('title', form), 'Advent service')
  await ui!.type(ui!.field('slug', form), 'advent-service')
  await ui!.type(ui!.field('startsAt', form), '2026-12-06T10:00')
  await ui!.submit(form)
  expect(api.requests('POST')[0]!.body).toMatchObject({
    // 10:00 in Chicago (CST, UTC-6).
    startsAt: Date.UTC(2026, 11, 6, 16),
    endsAt: null,
    timezone: 'America/Chicago',
  })
})

it('reinterprets the entered time when staff change the event timezone', async () => {
  const api = await renderEvents([])
  await ui!.click(ui!.button('Add event'))
  const form = ui!.formWith('startsAt')
  await ui!.type(ui!.field('title', form), 'Coast visit')
  await ui!.type(ui!.field('slug', form), 'coast-visit')
  await ui!.type(ui!.field('startsAt', form), '2026-12-06T10:00')
  await ui!.type(ui!.field('timezone', form), 'America/Los_Angeles')
  await ui!.submit(form)
  expect(api.requests('POST')[0]!.body).toMatchObject({
    startsAt: Date.UTC(2026, 11, 6, 18),
    timezone: 'America/Los_Angeles',
  })
})

it('refuses an unknown timezone before saving', async () => {
  const api = await renderEvents([])
  await ui!.click(ui!.button('Add event'))
  const form = ui!.formWith('startsAt')
  await ui!.type(ui!.field('title', form), 'Nowhere')
  await ui!.type(ui!.field('slug', form), 'nowhere')
  await ui!.type(ui!.field('startsAt', form), '2026-12-06T10:00')
  await ui!.type(ui!.field('timezone', form), 'Central')
  await ui!.submit(form)
  expect(api.requests('POST')).toHaveLength(0)
  expect(ui!.alert()).toMatch(/timezone/i)
})

const sermon: Sermon = {
  id: 'sermon-hope',
  churchId: 'church',
  slug: 'hope',
  title: 'Hope',
  status: 'published',
  speaker: 'Pastor Ana',
  summary: 'A message of hope',
  preachedAt: Date.UTC(2026, 8, 20, 12),
  featured: false,
  version: 2,
}

async function renderSermons(sermons: Sermon[] = [sermon]) {
  const api = stubApi((call) => {
    if (call.method === 'PATCH' || call.method === 'POST')
      return Response.json({}, { status: call.method === 'POST' ? 201 : 200 })
    if (call.path.startsWith('/api/sermons/church?'))
      return Response.json({ sermons })
    if (call.path.startsWith('/api/media/')) return Response.json({ media: [] })
    return Response.json(church)
  })
  ui = await mountStaff(<SermonsPage />)
  return api
}

it('shows and saves a sermon date as the same calendar date', async () => {
  const api = await renderSermons()
  expect(ui!.text()).toContain('Pastor Ana · Sep 20, 2026')
  await ui!.click(ui!.button('Edit'))
  const form = ui!.formWith('preachedAt')
  expect(ui!.field('preachedAt', form).value).toBe('2026-09-20')
  await ui!.submit(form)
  expect(api.requests('PATCH')[0]!.body).toMatchObject({
    preachedAt: Date.UTC(2026, 8, 20, 12),
  })
})

it('stores a new sermon date at noon UTC of the chosen day', async () => {
  const api = await renderSermons([])
  await ui!.click(ui!.button('Add sermon'))
  const form = ui!.formWith('preachedAt')
  await ui!.type(ui!.field('title', form), 'Advent hope')
  await ui!.type(ui!.field('slug', form), 'advent-hope')
  await ui!.type(ui!.field('speaker', form), 'Pastor Ana')
  await ui!.type(ui!.field('preachedAt', form), '2026-11-29')
  await ui!.submit(form)
  expect(api.requests('POST')[0]!.body).toMatchObject({
    preachedAt: Date.UTC(2026, 10, 29, 12),
  })
})

it('records and shows a manual contribution in the church timezone', async () => {
  // 23:00 on Sep 20 in New York (EDT, UTC-4) is 03:00 UTC on Sep 21.
  const gift: Contribution = {
    id: 'gift',
    churchId: 'church',
    donorName: 'Late Donor',
    amountMinor: 2500,
    currency: 'USD',
    fund: 'General',
    paymentMethod: 'cash',
    status: 'succeeded',
    recurring: false,
    donatedAt: Date.UTC(2026, 8, 21, 3),
    createdAt: 0,
    updatedAt: 0,
    version: 1,
  } as Contribution
  const api = stubApi((call) => {
    if (call.method === 'POST')
      return Response.json(
        { contribution: gift, replayed: false },
        { status: 201 },
      )
    if (call.path === '/api/churches/church')
      return Response.json({
        church: { ...church.church, timezone: 'America/New_York' },
      })
    return Response.json({
      contributions: [gift],
      page: { limit: 25, nextCursor: null },
    })
  })
  ui = await mountStaff(<ContributionsPage />)
  expect(ui.text()).toContain('Sep 20, 2026, 11:00 PM (America/New_York)')
  expect(ui.text()).toContain("In America/New_York, the church's timezone.")
  const form = ui.form()
  await ui.type(ui.field('donorName', form), 'Late Donor')
  await ui.type(ui.field('amount', form), '25.00')
  await ui.type(ui.field('donatedAt', form), '2026-09-20T23:00')
  await ui.submit(form)
  expect(api.requests('POST')[0]!.body).toMatchObject({
    amountMinor: 2500,
    currency: 'USD',
    donatedAt: '2026-09-21T03:00:00.000Z',
  })
})

it('enters and shows group meeting times in the church timezone', async () => {
  const meeting: GroupSession = {
    id: 'session',
    groupId: 'group',
    title: 'Harvest night',
    status: 'planned',
    // 19:00 in Chicago (CDT, UTC-5).
    startsAt: Date.UTC(2026, 8, 21, 0),
    version: 1,
  }
  const api = stubApi((call) => {
    if (call.method === 'POST')
      return Response.json({ sessions: [], replayed: false }, { status: 201 })
    return Response.json({ sessions: [meeting] })
  })
  ui = await mountStaff(
    <GroupSessionsPanel
      churchId="church"
      group={{ id: 'group', title: 'Midtown', location: 'Hall' } as Group}
      timeZone="America/Chicago"
      onClose={() => {}}
    />,
  )
  expect(ui.text()).toContain('Sep 20, 2026, 7:00 PM')
  expect(ui.text()).toContain('times in America/Chicago')
  await ui.click(ui.button('Add session'))
  const form = ui.form()
  expect(ui.text()).toContain("Times are in America/Chicago, the church's")
  await ui.type(ui.field('startsAt', form), '2026-09-27T19:00')
  await ui.submit(form)
  expect(api.requests('POST')[0]!.body).toMatchObject({
    startsAt: Date.UTC(2026, 8, 28, 0),
  })
})

it('explains a failed church read on the contribution form and keeps the draft', async () => {
  let churchFails = true
  const api = stubApi((call) => {
    if (call.method === 'POST')
      return Response.json(
        { contribution: {}, replayed: false },
        { status: 201 },
      )
    if (call.path === '/api/churches/church')
      return churchFails
        ? Response.json(
            { error: { code: 'unavailable', message: 'Church unavailable' } },
            { status: 503 },
          )
        : Response.json({
            church: { ...church.church, timezone: 'America/New_York' },
          })
    return Response.json({
      contributions: [],
      page: { limit: 25, nextCursor: null },
    })
  })
  ui = await mountStaff(<ContributionsPage />)
  const form = ui.form()
  await ui.type(ui.field('donorName', form), 'Patient Donor')
  await ui.type(ui.field('amount', form), '40')
  await ui.type(ui.field('donatedAt', form), '2026-09-20T09:30')
  expect(ui.alert()).toContain('Church unavailable')
  expect(ui.text()).toContain('timezone could not be loaded')
  expect(ui.text()).not.toContain('Loading the church')
  const record = () => ui!.button('Record contribution')
  expect(record().disabled).toBe(true)

  churchFails = false
  await ui.click(ui.button('Try again'))
  expect(ui.alert()).toBeNull()
  expect(ui.field('donorName', ui.form()).value).toBe('Patient Donor')
  expect(record().disabled).toBe(false)
  await ui.submit(ui.form())
  expect(api.requests('POST')[0]!.body).toMatchObject({
    amountMinor: 4000,
    donatedAt: '2026-09-20T13:30:00.000Z',
  })
})
