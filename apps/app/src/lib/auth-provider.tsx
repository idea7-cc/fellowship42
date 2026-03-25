/**
 * Auth provider abstraction.
 *
 * To swap providers (Clerk -> WorkOS -> Auth0), change ONLY this file.
 * No other file in the SPA imports from a specific auth SDK.
 *
 * ## Clerk (default)
 * npm install @clerk/clerk-react
 * Set VITE_CLERK_PUBLISHABLE_KEY in .env
 *
 * ## WorkOS AuthKit
 * npm install @workos-inc/authkit-react
 * Set VITE_WORKOS_CLIENT_ID in .env
 *
 * ## Development mode (no auth configured)
 * If no auth env vars are set, falls back to plain ConvexProvider.
 * Auth-guarded features will show "sign in required" states.
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  ConvexProvider,
  ConvexProviderWithAuth,
  ConvexReactClient,
  useMutation,
  useQuery,
} from 'convex/react'
import { api } from '@convex/_generated/api'

// ---------------------------------------------------------------------------
// Convex client singleton
// ---------------------------------------------------------------------------

const convexUrl = import.meta.env.VITE_CONVEX_URL
if (!convexUrl) {
  throw new Error('Missing VITE_CONVEX_URL. Set it before starting the app.')
}
const convex = new ConvexReactClient(convexUrl)

// ---------------------------------------------------------------------------
// Auth state types
// ---------------------------------------------------------------------------

interface AuthState {
  isSignedIn: boolean
  isLoading: boolean
  user: UserDoc | null
}

/** Minimal shape of the Convex `users` table document returned by getCurrent */
type UserDoc = {
  _id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl?: string
  roles: string[]
  churchIds: string[]
}

const AuthStateContext = createContext<AuthState>({
  isSignedIn: false,
  isLoading: true,
  user: null,
})

// ---------------------------------------------------------------------------
// Inner wrapper that reads the current user once auth is established
// ---------------------------------------------------------------------------

function AuthStateProvider({ children }: { children: ReactNode }) {
  const user = useQuery(api.users.getCurrent) as UserDoc | null | undefined

  const state = useMemo<AuthState>(() => {
    if (user === undefined) {
      return { isSignedIn: false, isLoading: true, user: null }
    }
    return {
      isSignedIn: user !== null,
      isLoading: false,
      user,
    }
  }, [user])

  return <AuthStateContext.Provider value={state}>{children}</AuthStateContext.Provider>
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

// Clerk module — loaded lazily only when the env var is set.
// This avoids a hard build dependency on @clerk/clerk-react.
let clerkModule: typeof import('@clerk/clerk-react') | null = null
let clerkLoadPromise: Promise<typeof import('@clerk/clerk-react')> | null = null

function getClerkModule(): Promise<typeof import('@clerk/clerk-react')> | null {
  if (!clerkPubKey) return null
  if (clerkModule) return Promise.resolve(clerkModule)
  if (!clerkLoadPromise) {
    clerkLoadPromise = import('@clerk/clerk-react').then((mod) => {
      clerkModule = mod
      return mod
    })
  }
  return clerkLoadPromise
}

// ---------------------------------------------------------------------------
// AuthenticatedConvexProvider
// ---------------------------------------------------------------------------

/**
 * Wraps the app with the appropriate Convex + auth provider stack.
 * Detects which provider is configured via environment variables.
 */
export function AuthenticatedConvexProvider({ children }: { children: ReactNode }) {
  if (clerkPubKey) {
    return <ClerkConvexProvider>{children}</ClerkConvexProvider>
  }

  // No auth provider configured — dev / preview mode
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn(
      '[Fellowship42] No auth provider configured. Set VITE_CLERK_PUBLISHABLE_KEY to enable Clerk auth. Falling back to unauthenticated ConvexProvider.',
    )
  }

  return (
    <ConvexProvider client={convex}>
      <AuthStateProvider>{children}</AuthStateProvider>
    </ConvexProvider>
  )
}

// ---------------------------------------------------------------------------
// Clerk provider (lazy loaded)
// ---------------------------------------------------------------------------

function ClerkConvexProvider({ children }: { children: ReactNode }) {
  const [clerk, setClerk] = useState(clerkModule)

  useEffect(() => {
    const promise = getClerkModule()
    if (!promise) return
    promise.then(setClerk)
  }, [])

  if (!clerk) {
    // While Clerk is loading, render the plain provider
    return (
      <ConvexProvider client={convex}>
        <AuthStateProvider>{children}</AuthStateProvider>
      </ConvexProvider>
    )
  }

  return (
    <ClerkConvexProviderInner clerkModule={clerk}>
      {children}
    </ClerkConvexProviderInner>
  )
}

function ClerkConvexProviderInner({
  children,
  clerkModule: clerk,
}: {
  children: ReactNode
  clerkModule: typeof import('@clerk/clerk-react')
}) {
  const { ClerkProvider } = clerk

  return (
    <ClerkProvider publishableKey={clerkPubKey!}>
      <ConvexProviderWithAuth client={convex} useAuth={useClerkConvexAuth}>
        <SyncUserOnAuth />
        <AuthStateProvider>{children}</AuthStateProvider>
      </ConvexProviderWithAuth>
    </ClerkProvider>
  )
}

/**
 * Hook bridging Clerk's useAuth to Convex's ConvexProviderWithAuth contract.
 * This is called as a React hook inside <ConvexProviderWithAuth>.
 */
function useClerkConvexAuth() {
  // By the time this hook runs, clerkModule is guaranteed to be loaded
  const { isLoaded, isSignedIn, getToken } = clerkModule!.useAuth()

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        const token = await getToken({ template: 'convex', skipCache: forceRefreshToken })
        return token
      } catch {
        return null
      }
    },
    [getToken],
  )

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken],
  )
}

/**
 * Automatically sync the user record after authentication.
 * Calls `users.syncFromAuth` once when the user becomes authenticated.
 */
function SyncUserOnAuth() {
  const { isSignedIn } = useAuthState()
  const syncFromAuth = useMutation(api.users.syncFromAuth)

  useEffect(() => {
    if (isSignedIn) {
      syncFromAuth()
    }
  }, [isSignedIn, syncFromAuth])

  return null
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

/**
 * Returns the current auth state: loading, signed-in status, and user doc.
 */
export function useAuthState(): AuthState {
  return useContext(AuthStateContext)
}

// ---------------------------------------------------------------------------
// Public UI components
// ---------------------------------------------------------------------------

/**
 * Sign-in button that delegates to the configured auth provider.
 * In dev mode (no provider), renders a disabled button.
 */
export function SignInButton({ className }: { className?: string }) {
  const [clerk, setClerk] = useState(clerkModule)

  useEffect(() => {
    const promise = getClerkModule()
    if (!promise) return
    promise.then(setClerk)
  }, [])

  const defaultClass =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-white/65 px-3.5 py-2 text-sm font-bold shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md'

  if (clerk) {
    const { SignInButton: ClerkSignIn } = clerk
    return (
      <ClerkSignIn mode="modal">
        <button type="button" className={className ?? defaultClass}>
          Sign in
        </button>
      </ClerkSignIn>
    )
  }

  return (
    <button
      type="button"
      disabled
      className={className ?? `${defaultClass} opacity-50`}
    >
      Sign in
    </button>
  )
}

/**
 * Sign-out button that delegates to the configured auth provider.
 * In dev mode (no provider), renders a disabled button.
 */
export function SignOutButton({ className }: { className?: string }) {
  const [clerk, setClerk] = useState(clerkModule)

  useEffect(() => {
    const promise = getClerkModule()
    if (!promise) return
    promise.then(setClerk)
  }, [])

  const defaultClass =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

  if (clerk) {
    const { SignOutButton: ClerkSignOut } = clerk
    return (
      <ClerkSignOut>
        <button type="button" className={className ?? defaultClass}>
          Sign out
        </button>
      </ClerkSignOut>
    )
  }

  return (
    <button
      type="button"
      disabled
      className={className ?? `${defaultClass} opacity-50`}
    >
      Sign out
    </button>
  )
}
