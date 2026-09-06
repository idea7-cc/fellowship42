import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiErrorBody } from './api-types'
import { connectRealtime } from './realtime-client'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let body: ApiErrorBody | undefined
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      body = undefined
    }
    throw new ApiError(
      body?.error.message ?? `Request failed with status ${response.status}`,
      response.status,
      body?.error.code ?? 'request_failed',
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function useApiQuery<T>(path: string | null) {
  const [result, setResult] = useState<{
    path: string | null
    data?: T
    error: ApiError | null
    loading: boolean
  }>({ path, error: null, loading: Boolean(path) })
  const requestNumber = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const activePath = useRef<string | null>(path)
  const mounted = useRef(false)

  const load = useCallback(async () => {
    if (!mounted.current || activePath.current !== path) return
    const currentRequest = ++requestNumber.current
    controller.current?.abort()
    controller.current = null
    if (!path) {
      setResult({ path, error: null, loading: false })
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setResult((previous) => ({
      path,
      data: previous.path === path ? previous.data : undefined,
      error: null,
      loading: true,
    }))
    try {
      const data = await apiRequest<T>(path, { signal: abort.signal })
      if (currentRequest === requestNumber.current && !abort.signal.aborted) {
        setResult({ path, data, error: null, loading: false })
      }
    } catch (caught) {
      if (currentRequest === requestNumber.current && !abort.signal.aborted) {
        setResult({
          path,
          error:
            caught instanceof ApiError
              ? caught
              : new ApiError(
                  'Unexpected request failure',
                  500,
                  'unexpected_error',
                ),
          loading: false,
        })
      }
    }
  }, [path])

  const cancelPending = useCallback(() => {
    ++requestNumber.current
    controller.current?.abort()
  }, [])

  useEffect(() => {
    mounted.current = true
    activePath.current = path
    void load()
    return () => {
      mounted.current = false
      activePath.current = null
      cancelPending()
    }
  }, [path, load, cancelPending])

  useEffect(() => {
    const invalidate = () => void load()
    window.addEventListener('f42:invalidate', invalidate)
    return () => window.removeEventListener('f42:invalidate', invalidate)
  }, [load])

  const current =
    result.path === path
      ? result
      : { data: undefined, error: null, loading: Boolean(path) }
  return {
    data: current.data,
    error: current.error,
    isLoading: current.loading,
    refetch: load,
  }
}

export function useChurchRealtime(churchId: string | null) {
  useEffect(() => {
    if (!churchId) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return connectRealtime(
      `${protocol}//${window.location.host}/api/churches/${encodeURIComponent(churchId)}/live`,
      () => window.dispatchEvent(new CustomEvent('f42:invalidate')),
    )
  }, [churchId])
}
