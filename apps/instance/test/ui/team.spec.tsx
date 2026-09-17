import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { TeamMembersPanel } from '../../src/components/team-members-panel'
import type { TeamResponse } from '../../contracts/api'

const team: TeamResponse = {
  members: [
    {
      membershipId: 'membership_demo_owner',
      userId: 'user_demo_owner',
      email: 'owner@example.test',
      firstName: 'Demo',
      lastName: 'Owner',
      accountStatus: 'active',
      membershipStatus: 'active',
      roleKeys: ['owner'],
      version: 1,
    },
  ],
  roles: [
    {
      key: 'owner',
      name: 'Owner',
      description: 'Full church administration',
      permissions: ['*'],
      isSystem: true,
    },
    {
      key: 'finance',
      name: 'Finance',
      description: 'Giving and finance access',
      permissions: ['contributions.read'],
      isSystem: true,
    },
  ],
}

it('preserves invitation input through a conflict and refreshes before retrying', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let teamReads = 0
  let resolveRefresh: (response: Response) => void = () => {}
  const posts: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return Response.json(
          {
            error: {
              code: 'team_member_exists',
              message: 'This person is already on the team',
            },
          },
          { status: 409 },
        )
      }
      if (++teamReads > 1) {
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve
        })
      }
      return Response.json(team)
    }),
  )
  try {
    await act(async () =>
      root.render(
        <TeamMembersPanel churchId="church" currentUserId="user_demo_owner" />,
      ),
    )
    expect(container.textContent).toContain('Demo Owner')
    expect(container.textContent).toContain('(you)')

    const form = container.querySelector('form')!
    const email = form.querySelector<HTMLInputElement>('[name="email"]')!
    const finance = form.querySelector<HTMLInputElement>(
      '[name="roleKeys"][value="finance"]',
    )!
    email.value = 'treasurer@example.test'
    finance.checked = true
    await act(async () => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(posts).toEqual([
      {
        email: 'treasurer@example.test',
        firstName: '',
        lastName: '',
        roleKeys: ['finance'],
      },
    ])
    // The conflict triggers exactly one refresh, and the form survives it.
    expect(teamReads).toBe(2)
    expect(container.contains(form)).toBe(true)
    expect(email.value).toBe('treasurer@example.test')
    expect(finance.checked).toBe(true)
    await act(async () => resolveRefresh(Response.json(team)))
    expect(email.value).toBe('treasurer@example.test')
    expect(finance.checked).toBe(true)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'already on the team',
    )
    expect(
      form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled,
    ).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})

it('requires a role before sending an invitation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const fetchMock = vi.fn(async () => Response.json(team))
  vi.stubGlobal('fetch', fetchMock)
  try {
    await act(async () => root.render(<TeamMembersPanel churchId="church" />))
    const form = container.querySelector('form')!
    form.querySelector<HTMLInputElement>('[name="email"]')!.value =
      'treasurer@example.test'
    await act(async () => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'at least one role',
    )
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
