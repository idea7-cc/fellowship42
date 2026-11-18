import { afterEach, expect, it } from 'vitest'
import { act } from 'react'
import { GroupsPage } from '../../src/routes/groups'
import { flush, mountStaff, stubApi } from './staff-harness'

type Ui = Awaited<ReturnType<typeof mountStaff>>
let ui: Ui | null = null
afterEach(async () => {
  await ui?.unmount()
  ui = null
})

const group = {
  id: 'group-a',
  churchId: 'church',
  slug: 'alpha',
  title: 'Alpha',
  status: 'published',
  groupType: 'small-group',
  audience: '',
  schedule: 'Sundays',
  enrollmentPolicy: 'open',
  openEnrollment: true,
  featured: false,
  summary: '',
  version: 1,
}

it('closes open group editors and panels when groups.write is removed', async () => {
  // The session stub reads this array on every request.
  const permissions = ['groups.read', 'groups.write']
  stubApi((call) => {
    if (call.path.endsWith('/sessions')) return Response.json({ sessions: [] })
    if (call.path.includes('groups'))
      return Response.json({
        groups: [group],
        page: { limit: 24, nextCursor: null },
      })
    return Response.json({
      church: { id: 'church', name: 'Grace', timezone: 'America/Chicago' },
    })
  }, permissions)
  ui = await mountStaff(<GroupsPage />)
  await ui.click(ui.button('Add group'))
  await ui.click(ui.button('Sessions'))
  expect(ui.buttons('Save group')).toHaveLength(1)
  expect(ui.buttons('Add session').length).toBeGreaterThan(0)

  permissions.splice(permissions.indexOf('groups.write'), 1)
  await act(async () => {
    window.dispatchEvent(new CustomEvent('f42:invalidate'))
  })
  await flush()
  expect(ui.buttons('Save group')).toHaveLength(0)
  expect(ui.buttons('Add session')).toHaveLength(0)
  expect(ui.text()).not.toContain('Sessions — Alpha')

  // Getting the permission back does not reopen what was closed.
  permissions.push('groups.write')
  await act(async () => {
    window.dispatchEvent(new CustomEvent('f42:invalidate'))
  })
  await flush()
  expect(ui.buttons('Save group')).toHaveLength(0)
  expect(ui.text()).not.toContain('Sessions — Alpha')
})
