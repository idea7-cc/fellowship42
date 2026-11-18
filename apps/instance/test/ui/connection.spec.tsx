import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { AppShell } from '../../src/components/app-shell'
import { ThemeModeProvider } from '../../src/lib/theme-mode'
import { ContributionsPage } from '../../src/routes/contributions'
import {
  apiError,
  configuredBootstrap,
  flush,
  mountStaff,
  session,
  stubApi,
  type RecordedCall,
} from './staff-harness'

/*
 * The app shell over a dropped connection: the bootstrap and session queries
 * the staff screens rest on, the realtime socket, and an entry that is being
 * retried. "Offline" makes every request fail as a dropped connection does.
 */

type Ui = Awaited<ReturnType<typeof mountStaff>>
let ui: Ui | null = null
let sockets: FakeSocket[] = []

class FakeSocket extends EventTarget {
  constructor() {
    super()
    sockets.push(this)
  }
  close() {}
}

beforeEach(() => {
  sockets = []
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout'],
    shouldAdvanceTime: true,
  })
})
afterEach(async () => {
  await ui?.unmount()
  ui = null
  vi.useRealTimers()
})

function phoneShell() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal('WebSocket', FakeSocket)
}

const church = {
  church: { id: 'church', name: 'Grace', timezone: 'America/New_York' },
}

/** Contributions inside the real gates and shell, with a keyed create. */
async function renderApp(
  sessionAnswer?: (call: RecordedCall) => Response | Promise<Response>,
) {
  phoneShell()
  const keys: string[] = []
  const rows: string[] = []
  let loseNextCreate = false
  const api = stubApi((call) => {
    if (call.path === '/api/bootstrap')
      return Response.json(configuredBootstrap)
    if (call.path === '/api/churches/church') return Response.json(church)
    if (call.method === 'POST') {
      const key = call.headers.get('idempotency-key')!
      keys.push(key)
      if (!rows.includes(key)) rows.push(key)
      if (loseNextCreate) {
        loseNextCreate = false
        api.setOffline(true)
        throw new TypeError('Failed to fetch')
      }
      return Response.json(
        { contribution: {}, replayed: false },
        { status: 201 },
      )
    }
    return Response.json({
      contributions: [],
      page: { limit: 25, nextCursor: null },
    })
  })
  if (sessionAnswer) {
    // Answer the session from the test, before the stub's default owner.
    const stubbed = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) =>
        path === '/api/session'
          ? sessionAnswer({
              path,
              method: init?.method ?? 'GET',
              headers: new Headers(init?.headers),
              body: undefined,
            })
          : stubbed(path, init),
      ),
    )
  }
  ui = await mountStaff(
    <ThemeModeProvider>
      <AppShell>
        <ContributionsPage />
      </AppShell>
    </ThemeModeProvider>,
    { gate: true },
  )
  return {
    api,
    keys,
    rows,
    loseNextCreate: () => {
      loseNextCreate = true
    },
  }
}

const staffScreen = () => ui!.container.querySelector('main h1')?.textContent
const notice = () =>
  Array.from(ui!.container.querySelectorAll('[role="status"]')).find((node) =>
    node.textContent?.includes('Connection lost'),
  )

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
  await flush()
}

it('reports a dropped connection after an unanswered create and keeps the entry', async () => {
  const { api, keys, rows, loseNextCreate } = await renderApp()
  const form = ui!.formWith('donorName')
  await ui!.type(ui!.field('donorName', form), 'Offline Gift')
  await ui!.type(ui!.field('amount', form), '25')
  await ui!.type(ui!.field('donatedAt', form), '2026-09-20T10:00')
  loseNextCreate()
  await ui!.submit(form)
  expect(ui!.alert()).toMatch(/will not be recorded twice/)
  // The shell checked its own queries at once, without any realtime event.
  expect(notice()).toBeDefined()
  expect(staffScreen()).toBe('Contributions')
  expect(ui!.field('donorName', ui!.formWith('donorName')).value).toBe(
    'Offline Gift',
  )

  // It keeps retrying while the connection is down, then clears.
  await advance(5_000)
  expect(notice()).toBeDefined()
  api.setOffline(false)
  await advance(5_000)
  expect(notice()).toBeUndefined()

  await ui!.submit(ui!.formWith('donorName'))
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
  expect(rows).toHaveLength(1)
  expect(ui!.text()).toContain('Contribution recorded')
})

it('checks the connection when the realtime socket drops', async () => {
  const { api } = await renderApp()
  const sessionReads = () => api.requests('GET', '/api/session').length
  const before = sessionReads()
  api.setOffline(true)
  await act(async () => {
    sockets.at(-1)!.dispatchEvent(new Event('close'))
  })
  await flush()
  expect(sessionReads()).toBeGreaterThan(before)
  expect(notice()).toBeDefined()
  expect(staffScreen()).toBe('Contributions')
})

it('keeps the reconnect notice inside the region the open drawer makes inert', async () => {
  const { api } = await renderApp()
  api.setOffline(true)
  await act(async () => {
    sockets.at(-1)!.dispatchEvent(new Event('close'))
  })
  await flush()
  await ui!.click(ui!.button('Open navigation'))
  const main = ui!.container.querySelector('main')!
  expect(main.hasAttribute('inert')).toBe(true)
  expect(main.contains(notice()!)).toBe(true)
})

it('does not bring staff screens back when a refused session is retried and the retry fails', async () => {
  let answer: () => Response | Promise<Response> = () => session()
  await renderApp(() => answer())
  expect(staffScreen()).toBe('Contributions')

  answer = () => apiError(403, 'account_suspended', 'This account is suspended')
  await act(async () => {
    window.dispatchEvent(new CustomEvent('f42:connection-check'))
  })
  await flush()
  expect(ui!.text()).toContain('Access denied')
  expect(staffScreen()).not.toBe('Contributions')

  // While a retry is in flight, and after it fails on the server, the old
  // user and permissions must not come back.
  let release: (response: Response) => void = () => {}
  answer = () => new Promise<Response>((resolve) => (release = resolve))
  await ui!.click(ui!.button('Check access again'))
  expect(staffScreen()).not.toBe('Contributions')
  await act(async () => release(apiError(503, 'unavailable', 'Try again')))
  await flush()
  expect(staffScreen()).not.toBe('Contributions')
  expect(ui!.text()).toContain('We could not check your access')

  answer = () => session()
  await advance(5_000)
  expect(staffScreen()).toBe('Contributions')
})

it('shows an access-check failure, not sign-in, when the first session read fails', async () => {
  let answer = () => apiError(503, 'unavailable', 'Try again')
  await renderApp(() => answer())
  expect(ui!.text()).toContain('We could not check your access')
  expect(ui!.text()).not.toContain('Sign in to your church')
  answer = () => session()
  await advance(5_000)
  expect(staffScreen()).toBe('Contributions')
})

it('signs staff out when the session refresh is refused with 401', async () => {
  let answer = () => session()
  await renderApp(() => answer())
  answer = () => apiError(401, 'unauthenticated', 'Sign in again')
  await act(async () => {
    window.dispatchEvent(new CustomEvent('f42:connection-check'))
  })
  await flush()
  expect(ui!.text()).toContain('Sign in to your church')
  expect(notice()).toBeUndefined()
})
