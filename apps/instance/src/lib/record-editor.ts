import { useCallback, useRef, useState } from 'react'
import { ApiError } from './api'

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
 * switching records cannot carry values or state across.
 *
 * Opening the record that is already open keeps the current session and its
 * unsaved input while the record's version is unchanged. Opening a newer
 * version of it starts a fresh session with the latest values: input typed
 * against the older version could only be refused as a conflict, and this is
 * how staff pick up the latest version after one (see `describeSaveFailure`).
 *
 * Completions must use `closeIf(session.key)`: a save for a record the user
 * has since left must not close the editor they are now using.
 */
export function useRecordEditor<T extends { id: string; version: number }>() {
  const [session, setSession] = useState<
    (EditorSession<T> & { identity: string }) | null
  >(null)
  const openings = useRef(0)

  const open = useCallback((value: T | 'new') => {
    const identity = value === 'new' ? 'new' : `record:${value.id}`
    const key = `${identity}#${++openings.current}`
    setSession((current) =>
      current?.identity === identity &&
      (value === 'new' ||
        (current.value !== 'new' && current.value.version === value.version))
        ? current
        : { identity, key, value },
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

/**
 * What a record editor says when saving an existing record fails. Keep one per
 * editor: it remembers whether an earlier attempt of this save ended without
 * an answer.
 *
 * A network failure or server error does not mean the edit was refused, so it
 * says the outcome is unknown. A version conflict refreshes the record's list
 * (`refresh`) and keeps the typed input. After an unconfirmed attempt the
 * conflict may be that attempt's own success, so it says so and asks staff to
 * compare before redoing the edit; otherwise it explains that someone else
 * changed the record and how to load the latest version.
 */
export function useSaveFailure(noun: string, refresh: () => unknown) {
  const unconfirmed = useRef(false)
  return useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError) || error.status >= 500) {
        unconfirmed.current = true
        return `We could not confirm whether your changes to this ${noun} were saved. Save again to retry, or cancel and check the ${noun}.`
      }
      if (error.status === 409 && error.code === 'version_conflict') {
        void refresh()
        if (unconfirmed.current) {
          return `This ${noun} has changed since you opened it, possibly because your earlier save went through. The latest version has been reloaded in the list. Compare it with your changes: if they are there, cancel; if not, choose Edit on the ${noun} again and redo them.`
        }
        return `This ${noun} changed after you opened it, so your changes were not saved. Choose Edit on the ${noun} again to load the latest version, then make your changes again.`
      }
      return error.message
    },
    [noun, refresh],
  )
}
