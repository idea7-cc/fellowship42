import { act } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { App } from '../../src/App'
import { SignOutButton } from '../../src/lib/auth-provider'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { SignInPage } from '../../src/routes/sign-in'
import { EnrollmentLink } from '../../src/components/enrollment-link'
vi.mock('@simplewebauthn/browser', () => ({
  WebAuthnAbortService: { cancelCeremony: vi.fn() },
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))
let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  window.history.replaceState(null, '', '/sign-in')
  vi.clearAllMocks()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const click = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}
it('keeps passkey cancellation on the quiet sign-in screen and allows retry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      Response.json(
        path.endsWith('/status')
          ? { local: true, access: false }
          : { challenge: 'test' },
      ),
    ),
  )
  vi.mocked(startAuthentication).mockRejectedValue(new Error('cancelled'))
  await act(async () => root.render(<SignInPage />))
  await click('Use passkey')
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'not completed',
  )
  expect(
    [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Use passkey',
    )?.disabled,
  ).toBe(false)
})
it('clears an enrollment fragment and sends its capability only in the enrollment body', async () => {
  const secret = 'A'.repeat(43)
  window.history.replaceState(null, '', `/sign-in#enroll=${secret}`)
  const posts: Array<{ path: string; body: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        posts.push({ path, body: JSON.parse(String(init.body)) })
      return Response.json(
        path.endsWith('/status')
          ? { local: true, access: false }
          : { challenge: 'test' },
      )
    }),
  )
  vi.mocked(startRegistration).mockRejectedValue(new Error('cancelled'))
  await act(async () => root.render(<SignInPage />))
  expect(window.location.hash).toBe('')
  expect(container.textContent).not.toContain(secret)
  await click('Create passkey')
  expect(posts).toEqual([
    {
      path: '/api/auth/enroll/start',
      body: { token: secret, bootstrap: false },
    },
  ])
})
it('does not finish a registration after the screen has unmounted', async () => {
  window.history.replaceState(null, '', '/sign-in#enroll=' + 'B'.repeat(43))
  const fetchMock = vi.fn(async (path: string) =>
    Response.json(
      path.endsWith('/status')
        ? { local: true, access: false }
        : { challenge: 'test' },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  let resolve!: (value: Awaited<ReturnType<typeof startRegistration>>) => void
  vi.mocked(startRegistration).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  await act(async () => root.render(<SignInPage />))
  await click('Create passkey')
  await act(async () => root.render(<div />))
  await act(async () =>
    resolve({} as Awaited<ReturnType<typeof startRegistration>>),
  )
  expect(
    fetchMock.mock.calls.some(([path]) => path.endsWith('/enroll/finish')),
  ).toBe(false)
})
it('does not show an enrollment link after the target row unmounts', async () => {
  let resolve!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r
        }),
    ),
  )
  await act(async () =>
    root.render(
      <EnrollmentLink
        churchId="church"
        membershipId="member"
        version={1}
        name="Pat"
      />,
    ),
  )
  await click('Create sign-in link for Pat')
  await act(async () => root.render(<div>Different team</div>))
  await act(async () =>
    resolve(
      Response.json({ url: 'https://example.test/sign-in#enroll=secret' }),
    ),
  )
  expect(container.textContent).toBe('Different team')
  expect(container.querySelector('input')).toBeNull()
})

it('switches an already-open sign-in route to enrollment when the fragment changes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ local: true, access: false })),
  )
  await act(async () =>
    root.render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    ),
  )
  expect(container.textContent).toContain('Use passkey')
  await act(async () => {
    window.history.pushState(null, '', '/sign-in#enroll=' + 'C'.repeat(43))
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(container.textContent).toContain('Create passkey')
  expect(window.location.hash).toBe('')
  // The same token revisited in the same tab is stripped again, even when
  // native history did not supply a new router location key.
  await act(async () => {
    window.history.pushState(null, '', '/sign-in#enroll=' + 'C'.repeat(43))
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(window.location.hash).toBe('')
  expect(container.textContent).toContain('Create passkey')
})
it('the icon sign-out action revokes the local session and reports failure without pretending to sign out', async () => {
  const paths: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      paths.push(path)
      return path.endsWith('/status')
        ? Response.json({ local: true, access: false })
        : Response.json(
            { error: { code: 'failed', message: 'failed' } },
            { status: 500 },
          )
    }),
  )
  await act(async () => root.render(<SignOutButton iconOnly />))
  await click('Sign out')
  expect(paths).toEqual(['/api/auth/status', '/api/auth/logout'])
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Unable to sign out',
  )
})
