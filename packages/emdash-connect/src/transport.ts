import type { ContractFetch } from '@fellowship42/website-contract'

/** The part of EmDash's sandboxed `ctx.http` the connector uses. */
export interface SandboxHttp {
  fetch(url: string, init?: RequestInit): Promise<Response>
}

/** Rejects when `signal` aborts, whichever settles first. */
export function abortable<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new Error('Fellowship42 request aborted'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort)
    })
  })
}

/**
 * `ctx.http` with the same policy as the trusted transport: redirects are
 * not followed, and the client's timeout applies even though an abort
 * signal cannot cross the sandbox bridge.
 */
export function sandboxTransport(http: SandboxHttp | undefined): ContractFetch {
  if (!http) return () => Promise.reject(new Error('network not granted'))
  return (url, init) =>
    abortable(
      http.fetch(url, {
        method: init.method,
        headers: init.headers,
        redirect: init.redirect,
      }),
      init.signal,
    )
}
