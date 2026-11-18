import type { ReactNode } from 'react'
import { Church, CloudOff, Lock } from 'lucide-react'
import { useAuthState, SignInButton, SignOutButton } from '@/lib/auth-provider'
import { useChurch } from '@/lib/church-context'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'

/** Presentation only: each API still authorizes its own request. */
export function StaffAccess({ children }: { children: ReactNode }) {
  const { user, isLoading, connectionLost, refusal, refetch } = useAuthState()
  const { churchId } = useChurch()
  if (user?.memberships.some((membership) => membership.churchId === churchId))
    return children
  // Retries of an unreachable session keep showing the failure, not a
  // loading flash and not a sign-in screen for someone who may be signed in.
  if (isLoading && !connectionLost) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
        <Skeleton aria-label="Checking access" className="h-32 w-64" />
      </main>
    )
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
      {connectionLost ? (
        <>
          <CloudOff aria-hidden className="size-8 text-muted-foreground" />
          <h1>We could not check your access</h1>
          <p className="text-sm text-muted-foreground" role="alert">
            The connection to this church instance failed. Retrying…
          </p>
          <Button size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </>
      ) : refusal?.status === 403 ? (
        <>
          <Lock aria-hidden className="size-8 text-muted-foreground" />
          <h1>Access denied</h1>
          <p className="text-sm text-muted-foreground" role="alert">
            {refusal.message}. Ask your church administrator for help.
          </p>
          <SignOutButton />
          <Button variant="ghost" size="sm" onClick={() => void refetch()}>
            Check access again
          </Button>
        </>
      ) : (
        <>
          <Church aria-hidden className="size-8 text-muted-foreground" />
          <h1>{user ? 'An invitation is needed' : 'Sign in to your church'}</h1>
          {user ? (
            <>
              <p className="text-sm text-muted-foreground">
                Ask your church administrator for access.
              </p>
              <SignOutButton />
            </>
          ) : (
            <SignInButton />
          )}
          <Button variant="ghost" size="sm" onClick={() => void refetch()}>
            Check access again
          </Button>
        </>
      )}
      {/* A full page load, so a connected website's redirect applies. */}
      <a className="text-sm text-muted-foreground" href="/">
        Church website
      </a>
    </main>
  )
}
