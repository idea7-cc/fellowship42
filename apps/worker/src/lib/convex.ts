/**
 * Helper for making HTTP requests to the Convex backend from the edge worker.
 * This is used for server-side data fetching (not the real-time React hooks).
 */

type ConvexQueryArgs = Record<string, unknown>

export async function convexQuery(
  convexUrl: string,
  functionName: string,
  args: ConvexQueryArgs = {},
): Promise<unknown> {
  const url = new URL(`/api/query`, convexUrl)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: functionName,
      args: [args],
    }),
  })

  if (!response.ok) {
    throw new Error(`Convex query failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  return result.value
}

export async function convexMutation(
  convexUrl: string,
  functionName: string,
  args: ConvexQueryArgs = {},
): Promise<unknown> {
  const url = new URL(`/api/mutation`, convexUrl)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: functionName,
      args: [args],
    }),
  })

  if (!response.ok) {
    throw new Error(`Convex mutation failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  return result.value
}
