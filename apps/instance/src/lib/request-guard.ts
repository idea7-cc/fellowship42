import { useCallback, useEffect, useRef } from 'react'

export interface RequestTicket {
  readonly signal: AbortSignal
  /** False once the component unmounted or a newer request superseded it. */
  isCurrent(): boolean
}

/**
 * Scopes an imperative load (one not made through `useApiQuery`) to the
 * newest request of this component. Start a ticket per request, pass its
 * signal to `apiRequest`, and apply the result only while `isCurrent()`.
 * Call `invalidate()` when the user makes a different choice directly, so a
 * slower earlier response cannot overwrite it.
 *
 * Do not use this to abort writes: a PATCH or POST may already have been
 * applied. Ignore their stale local completion instead.
 */
export function useRequestGuard() {
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      controller.current?.abort()
    }
  }, [])

  const invalidate = useCallback(() => {
    generation.current += 1
    controller.current?.abort()
    controller.current = null
  }, [])

  const start = useCallback((): RequestTicket => {
    invalidate()
    const abort = new AbortController()
    controller.current = abort
    const ticket = generation.current
    return {
      signal: abort.signal,
      isCurrent: () =>
        mounted.current &&
        ticket === generation.current &&
        !abort.signal.aborted,
    }
  }, [invalidate])

  return { start, invalidate }
}
