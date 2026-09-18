import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react'

import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiRequest, useApiQuery } from './api'
import { useLocation } from 'react-router-dom'
import type { SessionResponse, SessionUser } from './api-types'

interface AuthState {
  isSignedIn: boolean
  isLoading: boolean
  user: SessionUser | null
  refetch: () => Promise<void>
}

const AuthStateContext = createContext<AuthState | null>(null)

/**
 * An instance session or a configured Access adapter authenticates the request.
 * The session endpoint synchronizes that identity into D1 and returns scoped
 * church roles and permissions for the UI.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, refetch } =
    useApiQuery<SessionResponse>('/api/session')

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
    console.error('[Fellowship42] Unable to load the session', error)
  }

  return (
    <AuthStateContext.Provider value={value}>
      {children}
    </AuthStateContext.Provider>
  )
}

export function useAuthState(): AuthState {
  const state = useContext(AuthStateContext)
  if (!state) throw new Error('useAuthState must be used inside AuthProvider')
  return state
}

export function SignInButton({ className }: { className?: string }) {
  const location = useLocation()
  const href = `/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`
  return (
    <Button asChild className={className} size="sm" variant="secondary">
      <a href={href}>Sign in</a>
    </Button>
  )
}

export function SignOutButton({
  className,
  iconOnly = false,
}: {
  className?: string
  iconOnly?: boolean
}) {
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  async function signOut() {
    setBusy(true)
    setError(false)
    try {
      const config = await apiRequest<{ local: boolean; access: boolean }>(
        '/api/auth/status',
      )
      if (config.local)
        await apiRequest('/api/auth/logout', { method: 'POST', body: '{}' })
      window.location.assign(
        config.access ? '/cdn-cgi/access/logout' : '/sign-in',
      )
    } catch {
      setError(true)
      setBusy(false)
    }
  }
  return (
    <span>
      <Button
        className={className}
        aria-label="Sign out"
        size={iconOnly ? 'icon-xs' : 'sm'}
        variant="ghost"
        disabled={busy}
        onClick={() => void signOut()}
      >
        {iconOnly ? <LogOut aria-hidden /> : 'Sign out'}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          Unable to sign out. Try again.
        </span>
      )}
    </span>
  )
}
