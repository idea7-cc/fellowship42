import { createContext, useContext, type ReactNode } from 'react'

import type { ConfiguredChurchInstance } from './api-types'

/**
 * The church this instance serves.
 *
 * One deployment is one church, so the church is ambient rather than a route
 * parameter. `BootstrapGate` already fetches `/api/bootstrap` and refuses to
 * render the app until it reports `configured`, so the identity is known
 * before any route mounts and costs no extra request.
 *
 * This replaced `/churches/:churchId/...` routing. That shape made a
 * single-church product feel like a tenant selector — clicking "Church" led to
 * a list of one, which led to another view of the same church. The experience
 * principles call for the opposite: "The instance opens directly into the
 * church it serves; it does not feel like a generic multi-tenant selector."
 *
 * `church_id` remains in the data model and on every API path. Only the
 * browser's navigation collapsed.
 */
const ChurchContext = createContext<ConfiguredChurchInstance | null>(null)

export function ChurchProvider({
  children,
  instance,
}: {
  children: ReactNode
  instance: ConfiguredChurchInstance
}) {
  return <ChurchContext.Provider value={instance}>{children}</ChurchContext.Provider>
}

export function useChurch(): ConfiguredChurchInstance {
  const instance = useContext(ChurchContext)
  if (!instance) {
    throw new Error(
      'useChurch must be used inside ChurchProvider. The provider is mounted ' +
        'by BootstrapGate once the instance reports a configured church.',
    )
  }
  return instance
}
