import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  AgentConsentPanel,
  AgentConnectionsPanel,
} from '../../src/routes/agents'
import type { AgentConsent } from '../../contracts/agents'

const consent: AgentConsent = {
  requestId: 'consent-1',
  churchName: 'Grace Church',
  clientName: 'My agent',
  clientId: 'https://agent.example/client.json',
  redirectOrigin: 'https://agent.example',
  scopes: ['church:read', 'draft:read', 'draft:write'],
}
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function button(label: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label,
  )!
}

it('requires an explicit consent gesture and sends only the server-bound request ID', async () => {
  const navigate = vi.fn()
  const fetch = vi.fn(async (_path: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Response.json({
          redirectTo: 'https://agent.example/callback?code=test',
        })
      : Response.json(consent),
  )
  vi.stubGlobal('fetch', fetch)
  await act(async () =>
    root.render(
      <AgentConsentPanel queryString="?client_id=agent" navigate={navigate} />,
    ),
  )
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain('Save changes to your draft')
  expect(container.textContent).toContain('Publishing stays with you')
  await act(async () => button('Connect').click())
  expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({
    requestId: 'consent-1',
    decision: 'allow',
  })
  expect(navigate).toHaveBeenCalledWith(
    'https://agent.example/callback?code=test',
  )
})

it('ignores stale consent completion after navigating to a different agent', async () => {
  let finish!: (response: Response) => void
  const navigate = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            finish = resolve
          })
        : Response.json(consent),
    ),
  )
  await act(async () =>
    root.render(
      <AgentConsentPanel
        key="one"
        queryString="?client_id=one"
        navigate={navigate}
      />,
    ),
  )
  await act(async () => button('Connect').click())
  await act(async () =>
    root.render(
      <AgentConsentPanel
        key="two"
        queryString="?client_id=two"
        navigate={navigate}
      />,
    ),
  )
  await act(async () =>
    finish(Response.json({ redirectTo: 'https://old-agent.example/callback' })),
  )
  expect(navigate).not.toHaveBeenCalled()
  expect(button('Connect').disabled).toBe(false)
})

it('keeps the connection visible when revocation fails and removes it only after server confirmation', async () => {
  let fail = true
  let revoked = false
  const fetch = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (fail)
        return Response.json(
          { error: { code: 'offline', message: 'Try again.' } },
          { status: 503 },
        )
      revoked = true
      return Response.json({ revoked: true })
    }
    return Response.json({
      endpoint: 'https://church.example/mcp',
      connections: [
        {
          id: 'connection',
          clientId: 'agent',
          clientName: 'My agent',
          scopes: ['draft:read'],
          createdAt: 1,
          expiresAt: Date.now() + 100000,
          revokedAt: revoked ? Date.now() : null,
        },
      ],
    })
  })
  vi.stubGlobal('fetch', fetch)
  await act(async () =>
    root.render(<AgentConnectionsPanel churchId="church" />),
  )
  await act(async () => button('Disconnect').click())
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'Try again.',
  )
  expect(button('Disconnect')).toBeTruthy()
  fail = false
  await act(async () => button('Disconnect').click())
  expect(container.textContent).toContain('No connected agents.')
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('shows an expired consent error without redirecting or claiming success', async () => {
  const navigate = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json(
            {
              error: {
                code: 'consent_expired',
                message: 'Connect again from your agent.',
              },
            },
            { status: 410 },
          )
        : Response.json(consent),
    ),
  )
  await act(async () =>
    root.render(
      <AgentConsentPanel queryString="?client_id=agent" navigate={navigate} />,
    ),
  )
  await act(async () => button('Cancel').click())
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'Connect again from your agent.',
  )
  expect(navigate).not.toHaveBeenCalled()
})
