import { useMemo, useRef } from 'react'
import { ApiError } from './api'

/**
 * One `Idempotency-Key` per thing the user is entering.
 *
 * The key is minted on the first submit and kept across failures, so a retry
 * after a lost response replays the original create instead of making a
 * second record. Call `reset()` after a confirmed save or when the user
 * explicitly starts a new entry. Pass a `fingerprint` when the entry is a
 * picked file: choosing a different file is a new entry.
 */
export function useEntryKey(prefix: string) {
  const entry = useRef<{ key: string; fingerprint?: string } | null>(null)
  return useMemo(
    () => ({
      current(fingerprint?: string) {
        if (
          !entry.current ||
          (fingerprint !== undefined &&
            entry.current.fingerprint !== fingerprint)
        ) {
          entry.current = {
            key: `${prefix}-${crypto.randomUUID()}`,
            fingerprint,
          }
        }
        return entry.current.key
      },
      reset() {
        entry.current = null
      },
    }),
    [prefix],
  )
}

export interface EntryFailure {
  message: string
  /** The server may have saved the entry; the list can show whether it did. */
  uncertain: boolean
  /** The entry's key was already used for different details. */
  keyConflict: boolean
}

/**
 * Describes a failed create honestly. A network failure or server error does
 * not mean nothing was saved, so it says so and reassures that a retry of the
 * same entry is safe. It also asks open lists to refresh, so staff can see
 * whether the entry landed.
 */
export function describeEntryFailure(
  error: unknown,
  noun: string,
  verb = 'saved',
): EntryFailure {
  if (error instanceof ApiError && error.status < 500) {
    const keyConflict = error.code === 'idempotency_key_conflict'
    return {
      message: keyConflict
        ? `An earlier attempt at this entry was already ${verb} with different details. Check whether the ${noun} is listed before starting a new entry.`
        : error.message,
      uncertain: false,
      keyConflict,
    }
  }
  window.dispatchEvent(new CustomEvent('f42:invalidate'))
  return {
    message: `We could not confirm whether the ${noun} was ${verb}. Check the list, or submit again: this entry will not be ${verb} twice.`,
    uncertain: true,
    keyConflict: false,
  }
}
