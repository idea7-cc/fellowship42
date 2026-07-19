import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiErrorBody } from './api-types'

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
  const [data, setData] = useState<T | undefined>()
  const [error, setError] = useState<ApiError | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(path))
  const requestNumber = useRef(0)

  const load = useCallback(async () => {
    if (!path) {
      setData(undefined)
      setError(null)
      setIsLoading(false)
      return
    }

    const currentRequest = ++requestNumber.current
    setIsLoading(true)
    try {
      const next = await apiRequest<T>(path)
      if (currentRequest === requestNumber.current) {
        setData(next)
        setError(null)
      }
    } catch (caught) {
      if (currentRequest === requestNumber.current) {
        setData(undefined)
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(
                'Unexpected request failure',
                500,
                'unexpected_error',
              ),
        )
      }
    } finally {
      if (currentRequest === requestNumber.current) setIsLoading(false)
    }
  }, [path])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const invalidate = () => void load()
    window.addEventListener('f42:invalidate', invalidate)
    return () => window.removeEventListener('f42:invalidate', invalidate)
  }, [load])

  return { data, error, isLoading, refetch: load }
}

export function useChurchRealtime(churchId: string | null) {
  useEffect(() => {
    if (!churchId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/churches/${encodeURIComponent(churchId)}/live`,
    )

    socket.addEventListener('message', () => {
      window.dispatchEvent(new CustomEvent('f42:invalidate'))
    })

    return () => socket.close(1000, 'navigation')
  }, [churchId])
}
