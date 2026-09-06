import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApiQuery } from '../../src/lib/api'
import { connectRealtime } from '../../src/lib/realtime-client'

let root: Root
let container: HTMLDivElement
let refetch: () => Promise<void>
const pending: Array<(response: Response) => void> = []
function Query({ path }: { path: string | null }) {
  const query = useApiQuery<{ name: string }>(path)
  refetch = query.refetch
  return <output>{query.data?.name ?? 'empty'}</output>
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  pending.length = 0
  // Deliberately ignores AbortSignal: generation checks must also reject late results.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function resolve(index: number, name: string) {
  await act(async () => pending[index](Response.json({ name })))
}

describe('query lifecycle', () => {
  it('does not restore private data after the query is disabled', async () => {
    await act(async () => root.render(<Query path="/private" />))
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
    const oldRefetch = refetch
    await act(async () => root.render(<Query path={null} />))
    expect(signal?.aborted).toBe(true)
    await resolve(0, 'old private record')
    await act(async () => oldRefetch())
    expect(container.textContent).toBe('empty')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the current path when requests complete out of order', async () => {
    await act(async () => root.render(<Query path="/first" />))
    await act(async () => root.render(<Query path="/second" />))
    await resolve(1, 'second')
    await resolve(0, 'first')
    expect(container.textContent).toBe('second')
  })

  it('keeps the newest refresh and cancels work on unmount', async () => {
    await act(async () => root.render(<Query path="/record" />))
    await act(async () => {
      void refetch()
    })
    await resolve(1, 'latest')
    await resolve(0, 'stale')
    expect(container.textContent).toBe('latest')
    await act(async () => {
      void refetch()
    })
    const signal = vi.mocked(fetch).mock.calls[2][1]?.signal
    await act(async () => root.render(null))
    expect(signal?.aborted).toBe(true)
    await resolve(2, 'unmounted')
    expect(container.textContent).toBe('')
  })
})

it('reconnects realtime, refreshes missed events, and stops after disposal', () => {
  vi.useFakeTimers()
  const sockets: Array<EventTarget & { close: ReturnType<typeof vi.fn> }> = []
  vi.stubGlobal(
    'WebSocket',
    class extends EventTarget {
      close = vi.fn()
      constructor() {
        super()
        sockets.push(this)
      }
    },
  )
  const invalidate = vi.fn()
  const stop = connectRealtime('wss://example.test/live', invalidate)
  sockets[0].dispatchEvent(new Event('open'))
  sockets[0].dispatchEvent(new Event('close'))
  vi.advanceTimersByTime(1_000)
  expect(sockets).toHaveLength(2)
  sockets[1].dispatchEvent(new Event('open'))
  expect(invalidate).toHaveBeenCalledTimes(2)
  stop()
  sockets[1].dispatchEvent(new Event('close'))
  sockets[1].dispatchEvent(new Event('message'))
  vi.advanceTimersByTime(60_000)
  expect(sockets).toHaveLength(2)
  expect(invalidate).toHaveBeenCalledTimes(2)
  expect(sockets[1].close).toHaveBeenCalledWith(1000, 'navigation')
})
