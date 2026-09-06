import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { GroupRosterPanel } from '../../src/components/group-roster-panel'
import type { Group } from '../../contracts/api'

it('preserves roster input through a conflict and refreshes before retrying', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let rosterReads = 0
  let resolveRefresh: (response: Response) => void = () => {}
  const roster = { members: [], leaders: [], activeCount: 0 }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Response.json(
          {
            error: {
              code: 'version_conflict',
              message: 'Refresh before trying again.',
            },
          },
          { status: 409 },
        )
      }
      if (path.endsWith('/roster')) {
        if (++rosterReads > 1)
          return new Promise<Response>((resolve) => {
            resolveRefresh = resolve
          })
        return Response.json(roster)
      }
      return Response.json({
        people: [{ id: 'person-1', firstName: 'Test', lastName: 'Person' }],
      })
    }),
  )
  try {
    await act(async () =>
      root.render(
        <GroupRosterPanel
          churchId="church"
          group={{ id: 'group', title: 'Test group' } as Group}
          onClose={() => {}}
        />,
      ),
    )
    const form = container.querySelectorAll('form')[1]
    const person = form.querySelector<HTMLSelectElement>('[name="personId"]')!
    const status = form.querySelector<HTMLSelectElement>('[name="status"]')!
    person.value = 'person-1'
    status.value = 'pending'
    await act(async () => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(rosterReads).toBe(2)
    expect(container.contains(form)).toBe(true)
    expect(person.value).toBe('person-1')
    expect(status.value).toBe('pending')
    await act(async () => resolveRefresh(Response.json(roster)))
    expect(person.value).toBe('person-1')
    expect(status.value).toBe('pending')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Refresh',
    )
    expect(form.querySelector('button')?.disabled).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
