import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { AppShell } from '../../src/components/app-shell'
import { ThemeModeProvider } from '../../src/lib/theme-mode'
import { mountStaff, stubApi } from './staff-harness'

type Ui = Awaited<ReturnType<typeof mountStaff>>
let ui: Ui | null = null
afterEach(async () => {
  await ui?.unmount()
  ui = null
})

class QuietSocket extends EventTarget {
  close() {}
}

/** A phone-width viewport: no media query matches, so the sidebar is a drawer. */
function phoneViewport() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

async function renderShell() {
  phoneViewport()
  stubApi(() =>
    Response.json({ church: { id: 'church', name: 'Grace', theme: {} } }),
  )
  vi.stubGlobal('WebSocket', QuietSocket)
  ui = await mountStaff(
    <ThemeModeProvider>
      <AppShell>
        <a href="#behind">Page link</a>
      </AppShell>
    </ThemeModeProvider>,
    { path: '/app' },
  )
  const drawer = ui.container.querySelector<HTMLElement>('#app-sidebar')!
  const main = ui.container.querySelector('main')!
  return { drawer, main }
}

/** jsdom keeps the attribute but has no `inert` property. */
const inert = (element: Element) => element.hasAttribute('inert')

async function press(key: string) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

it('keeps a closed drawer out of the tab order', async () => {
  const { drawer, main } = await renderShell()
  expect(inert(drawer)).toBe(true)
  expect(inert(main)).toBe(false)
})

it('moves focus into the open drawer, holds the page behind it, and returns focus on Escape', async () => {
  const { drawer, main } = await renderShell()
  const opener = ui!.button('Open navigation')
  opener.focus()
  await ui!.click(opener)
  expect(inert(drawer)).toBe(false)
  expect(drawer.getAttribute('role')).toBe('dialog')
  expect(drawer.getAttribute('aria-modal')).toBe('true')
  expect(document.activeElement).toBe(ui!.button('Close navigation'))
  // The page and the top bar behind the scrim cannot take focus.
  expect(inert(main)).toBe(true)
  expect(inert(opener.closest('header')!)).toBe(true)

  await press('Escape')
  expect(inert(drawer)).toBe(true)
  expect(inert(main)).toBe(false)
  expect(document.activeElement).toBe(ui!.button('Open navigation'))
})

it('returns focus to the menu button when the drawer is closed by its button', async () => {
  const { drawer } = await renderShell()
  await ui!.click(ui!.button('Open navigation'))
  await ui!.click(ui!.button('Close navigation'))
  expect(inert(drawer)).toBe(true)
  expect(document.activeElement).toBe(ui!.button('Open navigation'))
})
