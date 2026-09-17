import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Church } from 'lucide-react'
import { useAuthState, SignInButton, SignOutButton } from '@/lib/auth-provider'
import { useChurch } from '@/lib/church-context'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'

/** Presentation only: each API still authorizes its own request. */
export function StaffAccess({ children }: { children: ReactNode }) {
  const { user, isLoading, refetch } = useAuthState()
  const { churchId } = useChurch()
  if (user?.memberships.some((membership) => membership.churchId === churchId))
    return children
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
      {isLoading ? (
        <Skeleton aria-label="Checking access" className="h-32 w-64" />
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
          <Link className="text-sm text-muted-foreground" to="/">
            Church website
          </Link>
        </>
      )}
    </main>
  )
}
