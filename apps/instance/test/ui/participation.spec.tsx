import { afterEach, expect, it } from 'vitest'
import { GroupRosterPanel } from '../../src/components/group-roster-panel'
import type { Group } from '../../contracts/api'
import { apiError, flush, mountStaff, stubApi } from './staff-harness'

let ui: Awaited<ReturnType<typeof mountStaff>> | undefined
afterEach(async () => {
  await ui?.unmount()
  ui = undefined
})

it('preserves roster input through a conflict and refreshes before retrying', async () => {
  const roster = { members: [], leaders: [], activeCount: 0 }
  let rosterReads = 0
  const api = stubApi((call) => {
    if (call.method === 'PUT')
      return apiError(409, 'version_conflict', 'Refresh before trying again.')
    if (call.path.endsWith('/roster')) {
      return ++rosterReads > 1 ? 'defer' : Response.json(roster)
    }
    if (call.path.startsWith('/api/people/church?'))
      return Response.json({
        people: [{ id: 'person-1', firstName: 'Test', lastName: 'Person' }],
        page: { limit: 20, nextCursor: null },
      })
  })
  ui = await mountStaff(
    <GroupRosterPanel
      churchId="church"
      group={{ id: 'group', title: 'Test group' } as Group}
      onClose={() => {}}
    />,
  )
  const form = ui.formWith('status')
  const status = ui.field<HTMLSelectElement>('status', form)
  await ui.choose('Add member', 'Test', 'Test Person')
  await ui.type(status, 'pending')
  await ui.submit(form)

  expect(rosterReads).toBe(2)
  expect(ui.container.contains(form)).toBe(true)
  expect(ui.field('personId', form).value).toBe('person-1')
  expect(ui.combobox('Add member').value).toBe('Test Person')
  expect(status.value).toBe('pending')
  api.held('GET', '/roster').resolve(Response.json(roster))
  await flush()
  expect(ui.field('personId', form).value).toBe('person-1')
  expect(status.value).toBe('pending')
  expect(ui.alert()).toContain('Refresh')
  expect(
    form.querySelector<HTMLButtonElement>('[type="submit"]')?.disabled,
  ).toBe(false)
})
