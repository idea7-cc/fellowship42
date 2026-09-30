import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
  type NavigateFunction,
} from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '../../src/lib/auth-provider'
import { ChurchProvider } from '../../src/lib/church-context'

/**
 * Shared harness for staff DOM regressions: a church-scoped app shell, a
 * fetch stub that records calls and can hold responses open, and small
 * interaction helpers. The stub ignores AbortSignal on purpose, so a stale
 * response still arrives and the component's own guards are exercised.
 */

export interface RecordedCall {
  path: string
  method: string
  headers: Headers
  body: unknown
}

export interface Deferred {
  call: RecordedCall
  resolve: (response: Response) => void
  reject: (error: unknown) => void
}

type Route = (
  call: RecordedCall,
) => Response | Promise<Response> | 'defer' | undefined

export function session(permissions: string[] = ['*']) {
  return Response.json({
    user: {
      id: 'staff',
      firstName: 'Demo',
      lastName: 'Staff',
      email: 'staff@example.test',
      memberships: [
        {
          churchId: 'church',
          churchName: 'Grace',
          roles: ['owner'],
          permissions,
        },
      ],
    },
  })
}

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status })
}

function parseBody(body: BodyInit | null | undefined) {
  if (typeof body !== 'string') return body ?? undefined
  try {
    return JSON.parse(body) as unknown
  } catch {
    return body
  }
}

export function stubApi(route: Route, permissions?: string[]) {
  const calls: RecordedCall[] = []
  const pending: Deferred[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const call: RecordedCall = {
        path,
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: parseBody(init?.body),
      }
      calls.push(call)
      if (path === '/api/session') return session(permissions)
      const answer = await route(call)
      if (answer === 'defer') {
        return new Promise<Response>((resolve, reject) =>
          pending.push({ call, resolve, reject }),
        )
      }
      if (!answer) throw new Error(`Unexpected request ${call.method} ${path}`)
      return answer
    }),
  )
  return {
    calls,
    pending,
    /** Calls with the given method whose path contains `fragment`. */
    requests(method: string, fragment = '') {
      return calls.filter(
        (call) => call.method === method && call.path.includes(fragment),
      )
    },
    /** The oldest held request matching `method` and `fragment`. */
    held(method: string, fragment = '') {
      const index = pending.findIndex(
        (entry) =>
          entry.call.method === method && entry.call.path.includes(fragment),
      )
      if (index < 0) throw new Error(`No held ${method} ${fragment}`)
      return pending.splice(index, 1)[0]!
    },
  }
}

export async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function NavigationProbe({
  onReady,
}: {
  onReady: (navigate: NavigateFunction) => void
}) {
  onReady(useNavigate())
  return null
}

export async function mountStaff(
  node: ReactNode,
  options: { path?: string; route?: string } = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  let navigateTo: NavigateFunction | null = null
  const tree = (path: string) => (
    <MemoryRouter initialEntries={[path]}>
      <NavigationProbe
        onReady={(navigate) => {
          navigateTo = navigate
        }}
      />
      <AuthProvider>
        <ChurchProvider
          instance={{
            churchId: 'church',
            churchName: 'Grace',
            churchSlug: 'grace',
          }}
        >
          {options.route ? (
            <Routes>
              <Route path={options.route} element={node} />
            </Routes>
          ) : (
            node
          )}
        </ChurchProvider>
      </AuthProvider>
    </MemoryRouter>
  )
  await act(async () => root.render(tree(options.path ?? '/')))
  await flush()

  const ui = {
    container,
    root,
    text: () => container.textContent ?? '',
    async navigate(path: string) {
      await act(async () => {
        await navigateTo?.(path)
      })
      await flush()
    },
    async unmount() {
      await act(async () => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    },
    buttons(label: string | RegExp) {
      return Array.from(container.querySelectorAll('button')).filter(
        (button) => {
          const names = [
            button.textContent?.trim() ?? '',
            button.getAttribute('aria-label') ?? '',
          ]
          return names.some((name) =>
            typeof label === 'string' ? name === label : label.test(name),
          )
        },
      )
    },
    button(label: string | RegExp, index = 0) {
      const match = ui.buttons(label)[index]
      if (!match) {
        throw new Error(
          `No button ${String(label)} in: ${ui.text().slice(0, 300)}`,
        )
      }
      return match
    },
    async click(element: HTMLElement) {
      await act(async () => element.click())
      await flush()
    },
    field<T extends HTMLElement = HTMLInputElement>(
      name: string,
      scope: ParentNode = container,
    ) {
      const element = scope.querySelector<T>(`[name="${name}"]`)
      if (!element) throw new Error(`No field ${name}`)
      return element
    },
    form(index = 0) {
      const forms = Array.from(container.querySelectorAll('form')).filter(
        (form) => form.getAttribute('role') !== 'search',
      )
      const form = forms[index]
      if (!form) throw new Error(`No form ${index}`)
      return form
    },
    /** Types like a user: works for controlled and uncontrolled fields. */
    async type(
      element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
      value: string,
    ) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(element),
          'value',
        )!.set!
        setter.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      })
    },
    async check(element: HTMLInputElement, checked: boolean) {
      if (element.checked !== checked) await ui.click(element)
    },
    async submit(form: HTMLFormElement) {
      await act(async () => {
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        )
      })
      await flush()
    },
    alert() {
      return container.querySelector('[role="alert"]')?.textContent ?? null
    },
    status() {
      return container.querySelector('[role="status"]')?.textContent ?? null
    },
  }
  return ui
}
