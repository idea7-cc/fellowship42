import { useCallback, useRef, useState } from 'react'

export interface EditorSession<T> {
  /** Unique per opening. Use it as the editor's React `key`. */
  readonly key: string
  readonly value: T | 'new'
}

/**
 * Which record an editor is open for.
 *
 * Record editors keep uncontrolled fields and local saving/error state, and
 * React applies `defaultValue` only when a field mounts. Keying the editor by
 * `session.key` gives every record (and every new entry) its own instance, so
 * switching records cannot carry values or state across. Opening the record
 * that is already open keeps the current session and its unsaved input.
 *
 * Completions must use `closeIf(session.key)`: a save for a record the user
 * has since left must not close the editor they are now using.
 */
export function useRecordEditor<T extends { id: string }>() {
  const [session, setSession] = useState<
    (EditorSession<T> & { identity: string }) | null
  >(null)
  const openings = useRef(0)

  const open = useCallback((value: T | 'new') => {
    const identity = value === 'new' ? 'new' : `record:${value.id}`
    const key = `${identity}#${++openings.current}`
    setSession((current) =>
      current?.identity === identity ? current : { identity, key, value },
    )
  }, [])
  const close = useCallback(() => setSession(null), [])
  const closeIf = useCallback(
    (key: string) =>
      setSession((current) => (current?.key === key ? null : current)),
    [],
  )

  return { session, open, close, closeIf }
}
