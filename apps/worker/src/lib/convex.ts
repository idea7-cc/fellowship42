/**
 * Helper for making HTTP requests to the Convex backend from the edge worker.
 * This is used for server-side data fetching (not the real-time React hooks).
 */

type ConvexQueryArgs = Record<string, unknown>
type ConvexSuccess<T> = {
  logLines?: string[]
  status: 'success'
  value: T
}

type ConvexFailure = {
  errorData?: unknown
  errorMessage?: string
  logLines?: string[]
  status: 'error'
}

const isConvexSuccess = <T>(value: unknown): value is ConvexSuccess<T> =>
  typeof value === 'object' &&
  value !== null &&
  'status' in value &&
  value.status === 'success' &&
  'value' in value

const isConvexFailure = (value: unknown): value is ConvexFailure =>
  typeof value === 'object' &&
  value !== null &&
  'status' in value &&
  value.status === 'error'

async function callConvex<T>(
  convexUrl: string,
  endpoint: 'query' | 'mutation',
  functionName: string,
  args: ConvexQueryArgs = {},
): Promise<T> {
  const url = new URL(`/api/${endpoint}`, convexUrl)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      args,
      format: 'json',
      path: functionName,
    }),
  })

  const result: unknown = await response.json()

  if (!response.ok) {
    const message = isConvexFailure(result)
      ? result.errorMessage ?? `Convex ${endpoint} failed`
      : `Convex ${endpoint} failed: ${response.status} ${response.statusText}`
    throw new Error(message)
  }

  if (!isConvexSuccess<T>(result)) {
    throw new Error(`Convex ${endpoint} returned an unexpected response shape`)
  }

  return result.value
}

export async function convexQuery<T = unknown>(
  convexUrl: string,
  functionName: string,
  args: ConvexQueryArgs = {},
): Promise<T> {
  return callConvex(convexUrl, 'query', functionName, args)
}

export async function convexMutation<T = unknown>(
  convexUrl: string,
  functionName: string,
  args: ConvexQueryArgs = {},
): Promise<T> {
  return callConvex(convexUrl, 'mutation', functionName, args)
}
