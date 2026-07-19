import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
} from 'react'

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

const signInClass =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-white/65 px-3.5 py-2 text-sm font-bold shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md'

const signOutClass =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

export function SignInButton({ className }: { className?: string }) {
  return (
    <a href="/cdn-cgi/access/login" className={className ?? signInClass}>
      Sign in
    </a>
  )
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <a href="/cdn-cgi/access/logout" className={className ?? signOutClass}>
      Sign out
    </a>
  )
}
