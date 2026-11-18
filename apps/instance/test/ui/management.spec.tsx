import { afterEach, expect, it } from 'vitest'
import { act } from 'react'
import type { ManagementStatusResponse } from '../../contracts/api'
import { ManagementPage } from '../../src/routes/management'
import { apiError, flush, mountStaff, stubApi } from './staff-harness'

let ui: Awaited<ReturnType<typeof mountStaff>> | null = null
afterEach(async () => {
  await ui?.unmount()
  ui = null
})

const independent: ManagementStatusResponse = {
  instanceId: 'instance_test',
  enabled: false,
  identity: null,
  pendingEnrollment: null,
  lastDisposition: null,
  supportSessions: [],
  connection: null,
}

it('shows a failed status refresh beside the last known status', async () => {
  let failStatus = false
  stubApi((call) => {
    if (call.path === '/api/management')
      return failStatus
        ? apiError(503, 'unavailable', 'Management status is unavailable')
        : Response.json(independent)
    if (call.path === '/api/management/updates')
      return Response.json({ preparations: [] })
    return undefined
  })
  ui = await mountStaff(<ManagementPage />)
  expect(ui.text()).toContain('Independent')
  expect(ui.alert()).toBeNull()

  failStatus = true
  await act(async () => {
    window.dispatchEvent(new CustomEvent('f42:invalidate'))
  })
  await flush()
  expect(ui.alert()).toContain('Management status is unavailable')
  expect(ui.text()).toContain('Last known: Independent')
  expect(ui.buttons('Try again')).toHaveLength(1)

  failStatus = false
  await ui.click(ui.button('Try again'))
  expect(ui.alert()).toBeNull()
  expect(ui.text()).not.toContain('Last known')
})
