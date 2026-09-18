import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ChurchSettingsEditor } from '../../src/routes/church-settings'
import { ChurchWebsite } from '../../src/components/church-site'
import { App } from '../../src/App'
import type {
  ChurchSettings,
  ChurchSite,
} from '../../contracts/church-settings'

const initial: ChurchSettings = {
  draft: {
    name: 'Grace Church',
    tagline: 'A place to belong',
    summary: 'Everyone is welcome.',
    timezone: 'America/New_York',
    street: '',
    city: '',
    region: '',
    postalCode: '',
    countryCode: 'US',
    phone: '',
    email: '',
    websiteUrl: '',
    givingUrl: '',
    livestreamUrl: '',
    themePreset: 'warm',
    logoMediaId: null,
    coverMediaId: null,
    serviceTimes: [],
  },
  review: {
    baseline: {} as ChurchSettings['draft'],
    canRestore: false,
    changedBy: null,
  },
  version: 1,
  published: false,
  hasDraft: false,
  readiness: { profile: true, services: false, content: false },
}
initial.review.baseline = structuredClone(initial.draft)
const site: ChurchSite = {
  church: {
    id: 'church',
    slug: 'grace',
    name: 'Grace Church',
    status: 'published',
    tagline: 'A place to belong',
    summary: 'Everyone is welcome.',
    timezone: 'America/New_York',
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      countryCode: 'US',
    },
    contact: {},
    theme: { preset: 'warm' },
    serviceTimes: [],
  },
  groups: [],
  courses: [],
  events: [],
  sermons: [],
}
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function renderEditor() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ChurchSettingsEditor churchId="church" initial={initial} />
      </MemoryRouter>,
    ),
  )
}
function button(text: string) {
  const found = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  )
  expect(found, text).toBeTruthy()
  return found!
}
async function click(text: string) {
  await act(async () => button(text).click())
}
async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}

it('keeps unsaved edits separate from saved preview and publishes the saved version', async () => {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      calls.push({ path, body })
      return Response.json({
        ...initial,
        draft: body.draft ?? { ...initial.draft, themePreset: 'calm' },
        version: calls.length + 1,
        hasDraft: path.endsWith('/save'),
        published: path.endsWith('/publish'),
      })
    }),
  )
  await renderEditor()
  await click('Appearance')
  await click('calm')
  expect(button('Publish').disabled).toBe(true)
  expect(
    container.querySelector('a[href="/app/preview"]')?.getAttribute('target'),
  ).toBe('_blank')
  await submit()
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Draft saved',
  )
  expect(button('Publish').disabled).toBe(false)
  await click('Publish')
  expect(calls[0].body).toMatchObject({
    version: 1,
    draft: { themePreset: 'calm' },
  })
  expect(calls[1]).toEqual({
    path: '/api/church-settings/church/publish',
    body: { version: 2 },
  })
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Website published',
  )
})
it('preserves edits after a conflict until the owner explicitly reloads', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method
        ? Response.json(
            {
              error: {
                code: 'version_conflict',
                message: 'Reload the saved draft.',
              },
            },
            { status: 409 },
          )
        : Response.json({ ...initial, version: 4 }),
    ),
  )
  await renderEditor()
  await click('Appearance')
  await click('forest')
  await submit()
  expect(button('forest').getAttribute('aria-pressed')).toBe('true')
  expect(button('Save draft').disabled).toBe(true)
  await click('Reload saved draft')
  expect(button('warm').getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('[role="alert"]')).toBeNull()
})
it('ignores a delayed save completion after leaving settings', async () => {
  let finish: (response: Response) => void = () => {}
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    ),
  )
  const invalidate = vi.fn()
  window.addEventListener('f42:invalidate', invalidate)
  try {
    await renderEditor()
    await click('Appearance')
    await click('calm')
    await submit()
    expect(button('calm').closest('fieldset')?.disabled).toBe(true)
    await act(async () => root.render(<p>Another page</p>))
    await act(async () => finish(Response.json({ ...initial, version: 2 })))
    expect(container.textContent).toBe('Another page')
    expect(invalidate).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('f42:invalidate', invalidate)
  }
})
it('renders the public homepage without session, bootstrap, or staff navigation', async () => {
  const fetch = vi.fn(async () => Response.json(site))
  vi.stubGlobal('fetch', fetch)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    ),
  )
  expect(fetch.mock.calls).toHaveLength(1)
  expect(container.textContent).toContain('A place to belong')
  expect(container.textContent).not.toContain('Management')
  expect(container.querySelector('a[href="/app"]')).not.toBeNull()
})
it('offers a quiet unpublished state without exposing church details', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { error: { code: 'site_unpublished', message: 'Not published' } },
        { status: 404 },
      ),
    ),
  )
  await act(async () =>
    root.render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    ),
  )
  expect(container.textContent).toContain('See you soon')
  expect(container.textContent).not.toContain('Grace Church')
})
it('keeps empty content sections and operator controls out of the visitor page', async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ChurchWebsite site={site} />
      </MemoryRouter>,
    ),
  )
  expect(container.querySelectorAll('h2')).toHaveLength(0)
  expect(container.textContent).not.toContain('No groups')
  expect(container.querySelector('a[href="#church-content"]')).not.toBeNull()
})

it('keeps the editor mounted while bootstrap status refreshes after a save', async () => {
  const { BootstrapGate } = await import('../../src/components/bootstrap-gate')
  let bootstrapReads = 0
  let finish: (response: Response) => void = () => {}
  const bootstrap = {
    state: 'configured',
    instance: {
      churchId: 'church',
      churchName: 'Grace Church',
      churchSlug: 'grace',
    },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/bootstrap') {
        if (++bootstrapReads === 1) return Response.json(bootstrap)
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      const body = JSON.parse(String(init?.body))
      return Response.json({
        ...initial,
        draft: body.draft,
        version: 2,
        hasDraft: true,
      })
    }),
  )
  await act(async () =>
    root.render(
      <MemoryRouter>
        <BootstrapGate>
          <ChurchSettingsEditor churchId="church" initial={initial} />
        </BootstrapGate>
      </MemoryRouter>,
    ),
  )
  await click('Appearance')
  await click('calm')
  await submit()
  expect(bootstrapReads).toBe(2)
  expect(button('Appearance').getAttribute('aria-selected')).toBe('true')
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Draft saved',
  )
  await act(async () => finish(Response.json(bootstrap)))
  expect(button('calm').getAttribute('aria-pressed')).toBe('true')
})

it('keeps staff navigation behind membership presentation checks', async () => {
  const paths: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      paths.push(path)
      return Response.json(
        path === '/api/session'
          ? { user: null }
          : {
              state: 'configured',
              instance: {
                churchId: 'church',
                churchName: 'Grace Church',
                churchSlug: 'grace',
              },
            },
      )
    }),
  )
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/app/settings']}>
        <App />
      </MemoryRouter>,
    ),
  )
  expect(container.textContent).toContain('Sign in to your church')
  expect(container.querySelector('[aria-label="Main navigation"]')).toBeNull()
  expect(paths.sort()).toEqual(['/api/bootstrap', '/api/session'])
})

it('shows agent attribution and reviewed fields and restores only the observed saved version', async () => {
  const reviewed: ChurchSettings = {
    ...initial,
    version: 5,
    hasDraft: true,
    draft: { ...initial.draft, tagline: 'Agent welcome' },
    review: {
      baseline: initial.draft,
      canRestore: true,
      changedBy: { kind: 'agent', name: 'Writing assistant', at: 1 },
    },
  }
  const fetch = vi.fn(async (_path: string, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toEqual({ version: 5 })
    return Response.json({ ...initial, version: 6, hasDraft: true })
  })
  vi.stubGlobal('fetch', fetch)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ChurchSettingsEditor churchId="church" initial={reviewed} />
      </MemoryRouter>,
    ),
  )
  expect(container.textContent).toContain('Edited by agent Writing assistant')
  expect(container.textContent).toContain('Review changes (1)')
  expect(container.querySelector('del')?.textContent).toBe('A place to belong')
  expect(container.querySelector('ins')?.textContent).toBe('Agent welcome')
  await click('Restore previous')
  expect(fetch.mock.calls[0][0]).toBe('/api/church-settings/church/restore')
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Previous draft restored',
  )
})

it('keeps unsaved human edits when a newer agent draft arrives and requires explicit reload', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...initial, version: 2 })),
  )
  await renderEditor()
  await click('Appearance')
  await click('forest')
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ChurchSettingsEditor
          churchId="church"
          initial={{ ...initial, version: 2 }}
        />
      </MemoryRouter>,
    ),
  )
  expect(button('forest').getAttribute('aria-pressed')).toBe('true')
  expect(button('Publish').disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'newer draft',
  )
  await click('Reload saved draft')
  expect(button('warm').getAttribute('aria-pressed')).toBe('true')
})

it('requires deliberate review of a newer clean draft without claiming unsaved edits', async () => {
  const confirm = vi.mocked(window.confirm)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...initial, version: 2 })),
  )
  await renderEditor()
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ChurchSettingsEditor
          churchId="church"
          initial={{ ...initial, version: 2 }}
        />
      </MemoryRouter>,
    ),
  )
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Draft updated. Reload to review.',
  )
  await click('Reload saved draft')
  expect(confirm).not.toHaveBeenCalled()
})
