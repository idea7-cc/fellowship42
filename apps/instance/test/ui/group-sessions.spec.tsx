import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupSessionsPanel } from '../../src/components/group-sessions-panel'
import type { Group, GroupSession } from '../../contracts/api'
import { apiError, mountStaff, stubApi } from './staff-harness'

type Ui = Awaited<ReturnType<typeof mountStaff>>
let ui: Ui | null = null
afterEach(async () => {
  await ui?.unmount()
  ui = null
  vi.restoreAllMocks()
})

const group = { id: 'group', title: 'Midtown', location: 'Hall' } as Group
const meeting: GroupSession = {
  id: 'session',
  groupId: 'group',
  title: 'Harvest night',
  status: 'submitted',
  // 19:00 in Chicago (CDT).
  startsAt: Date.UTC(2026, 8, 20, 0),
  version: 2,
}

async function renderPanel(route: Parameters<typeof stubApi>[0]) {
  const api = stubApi(route)
  ui = await mountStaff(
    <GroupSessionsPanel
      churchId="church"
      group={group}
      timeZone="America/Chicago"
      onClose={() => {}}
    />,
  )
  return api
}

describe('deleting a meeting', () => {
  it('asks first, naming the meeting, and sends nothing when declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const api = await renderPanel(() => Response.json({ sessions: [meeting] }))
    await ui!.click(ui!.button('Delete Harvest night'))
    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm.mock.calls[0]![0]).toMatch(
      /Harvest night on Sep 19, 2026, 7:00 PM\? .*attendance register/,
    )
    expect(api.requests('DELETE')).toHaveLength(0)
  })

  it('offers to cancel a meeting whose attendance blocks deletion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let stored = meeting
    const api = await renderPanel((call) => {
      if (call.method === 'DELETE') {
        // Someone else edited the meeting since the panel last loaded it.
        stored = { ...stored, version: 5 }
        return apiError(
          409,
          'session_has_attendance',
          'This session has recorded attendance, so it cannot be deleted.',
        )
      }
      if (call.method === 'PATCH') {
        stored = { ...stored, status: 'cancelled', version: 6 }
        return Response.json({ session: stored })
      }
      return Response.json({ sessions: [stored] })
    })
    await ui!.click(ui!.button('Delete Harvest night'))
    expect(ui!.alert()).toMatch(
      /has recorded attendance, so it cannot be deleted\. Cancel the meeting instead/,
    )
    await ui!.click(ui!.button('Cancel Harvest night'))
    // The cancellation is built from the row refreshed after the refusal.
    expect(api.requests('PATCH')[0]!.body).toEqual({
      status: 'cancelled',
      version: 5,
    })
    expect(ui!.alert()).toBeNull()
    expect(
      ui!.container.querySelector<HTMLSelectElement>(
        'select[aria-label="Status for Harvest night"]',
      )!.value,
    ).toBe('cancelled')
  })
})

describe('failed reads', () => {
  it('does not show a failed register as an empty one', async () => {
    let attendanceFails = true
    await renderPanel((call) => {
      if (call.path.endsWith('/attendance')) {
        if (attendanceFails)
          return apiError(503, 'unavailable', 'Attendance is unavailable')
        return Response.json({
          entries: [],
          presentCount: 0,
          recordedCount: 0,
        })
      }
      return Response.json({ sessions: [meeting] })
    })
    await ui!.click(ui!.button(/Harvest night/))
    expect(ui!.text()).not.toContain('Nobody is recorded')
    expect(ui!.alert()).toContain('Attendance is unavailable')
    attendanceFails = false
    await ui!.click(ui!.button('Try again'))
    expect(ui!.alert()).toBeNull()
    expect(ui!.text()).toContain('Nobody is recorded')
  })

  it('shows refused access as denied, with nothing to retry', async () => {
    await renderPanel(() =>
      apiError(403, 'permission_denied', 'You do not have permission'),
    )
    expect(ui!.text()).not.toContain('No sessions yet')
    expect(ui!.text()).toContain('Your role does not include access')
    expect(ui!.buttons('Try again')).toHaveLength(0)
  })
})
