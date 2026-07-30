import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
} from 'react'

import { Button } from '@/components/ui/button'
import { useApiQuery } from './api'
import type { SessionResponse, SessionUser } from './api-types'

interface AuthState {
  isSignedIn: boolean
  isLoading: boolean
  user: SessionUser | null
  refetch: () => Promise<void>
}

const AuthStateContext = createContext<AuthState | null>(null)

/**
 * Cloudflare Access authenticates the request before it reaches the Worker.
 * The session endpoint synchronizes that identity into D1 and returns scoped
 * church roles and permissions for the UI.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, refetch } = useApiQuery<SessionResponse>('/api/session')

  const value = useMemo<AuthState>(
    () => ({
      isSignedIn: Boolean(data?.user),
      isLoading,
      user: data?.user ?? null,
      refetch,
    }),
    [data, isLoading, refetch],
  )

  if (error && error.status >= 500) {
    console.error('[Fellowship42] Unable to load the Cloudflare Access session', error)
  }

  return <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>
}

export function useAuthState(): AuthState {
  const state = useContext(AuthStateContext)
  if (!state) throw new Error('useAuthState must be used inside AuthProvider')
  return state
}

// Access sign-in and sign-out are plain navigations, not fetches, so these
// stay anchors — styled as buttons rather than reimplementing the variants.
export function SignInButton({ className }: { className?: string }) {
  return (
    <Button asChild className={className} size="sm" variant="secondary">
      <a href="/cdn-cgi/access/login">Sign in</a>
    </Button>
  )
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <Button asChild className={className} size="sm" variant="ghost">
      <a href="/cdn-cgi/access/logout">Sign out</a>
    </Button>
  )
}
