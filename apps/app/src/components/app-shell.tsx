import { useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'

import { useAuthState, SignInButton, SignOutButton } from '@/lib/auth-provider'
import { asId } from '@/lib/convex'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// Navigation definitions
// ---------------------------------------------------------------------------

interface NavItem {
  label: string
  path: string
  /** When true, only show when inside a church context */
  churchScoped?: boolean
  /** A note shown as a smaller label */
  note?: string
}

const globalNav: NavItem[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Churches', path: '/churches' },
]

const churchNav: NavItem[] = [
  { label: 'Overview', path: '' },
  { label: 'People', path: '/people' },
  { label: 'Groups', path: '/groups' },
  { label: 'Courses', path: '/courses' },
  { label: 'Events', path: '/events' },
  { label: 'Sermons', path: '/sermons' },
  { label: 'Facilities', path: '/facilities' },
  { label: 'Contributions', path: '/contributions', note: 'finance' },
]

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { churchId } = useParams<{ churchId: string }>()
  const location = useLocation()
  const { isSignedIn, isLoading: authLoading, user } = useAuthState()

  // Detect church context from the URL path
  const churchIdFromPath = extractChurchId(location.pathname)
  const activeChurchId = churchId ?? churchIdFromPath

  // Fetch church name when inside a church context
  const churchArgs = activeChurchId
    ? { churchId: asId<'churches'>(activeChurchId) }
    : 'skip'
  const church = useQuery(api.churches.getPublishedById, churchArgs)

  const churchBasePath = activeChurchId ? `/churches/${activeChurchId}` : null

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Top header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-md">
        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent lg:hidden"
            aria-label="Toggle navigation"
          >
            <HamburgerIcon />
          </button>
          <Link to="/" className="flex items-center gap-2 font-sans text-sm font-bold tracking-tight">
            <span className="text-accent-strong">Fellowship42</span>
          </Link>
        </div>

        {/* Center: current church name */}
        <div className="hidden flex-1 items-center justify-center sm:flex">
          {church ? (
            <Link
              to={`/churches/${activeChurchId}`}
              className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {church.name}
            </Link>
          ) : null}
        </div>

        {/* Right: user menu */}
        <div className="flex items-center gap-2">
          {authLoading ? (
            <span className="text-xs text-muted-foreground">Loading...</span>
          ) : isSignedIn && user ? (
            <div className="flex items-center gap-2">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={`${user.firstName} ${user.lastName}`}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-accent-strong">
                  {user.firstName?.charAt(0) ?? '?'}
                </span>
              )}
              <span className="hidden text-sm font-medium sm:inline">
                {user.firstName}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <SignInButton />
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* ── Mobile sidebar overlay ──────────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 mt-14 w-64 transform border-r border-border/60 bg-card/90 backdrop-blur-md transition-transform duration-200 lg:static lg:z-auto lg:mt-0 lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
            {/* Global navigation */}
            <SidebarSection label="Navigation">
              {globalNav.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  active={isNavActive(location.pathname, item.path, false)}
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </SidebarSection>

            {/* Church-scoped navigation */}
            {churchBasePath && (
              <>
                <Separator className="my-2" />
                <SidebarSection label={church?.name ?? 'Church'}>
                  {churchNav.map((item) => {
                    const fullPath = `${churchBasePath}${item.path}`
                    return (
                      <NavLink
                        key={item.path}
                        to={fullPath}
                        active={isNavActive(location.pathname, fullPath, true)}
                        note={item.note}
                        onClick={() => setSidebarOpen(false)}
                      >
                        {item.label}
                      </NavLink>
                    )
                  })}
                </SidebarSection>
              </>
            )}
          </nav>
        </aside>

        {/* ── Main content ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar building blocks
// ---------------------------------------------------------------------------

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="border-0 bg-transparent p-0 shadow-none">
      <span className="mb-1 block px-2 pt-2 font-mono text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col gap-0.5">{children}</div>
    </Card>
  )
}

function NavLink({
  to,
  active,
  note,
  children,
  onClick,
}: {
  to: string
  active: boolean
  note?: string
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Link to={to} onClick={onClick}>
      <Button
        variant={active ? 'default' : 'ghost'}
        size="sm"
        className={cn(
          'w-full justify-start gap-2 text-left',
          active && 'pointer-events-none',
        )}
      >
        <span className="truncate">{children}</span>
        {note && (
          <span className="ml-auto shrink-0 rounded-full border border-border px-1.5 py-px text-[0.6rem] font-medium text-muted-foreground">
            {note}
          </span>
        )}
      </Button>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract churchId from a URL path like /churches/:churchId/... */
function extractChurchId(pathname: string): string | null {
  const match = pathname.match(/^\/churches\/([^/]+)/)
  return match ? match[1] : null
}

/** Determine if a nav item should be marked active */
function isNavActive(currentPath: string, itemPath: string, exact: boolean): boolean {
  if (exact) {
    // For church-scoped items: exact match needed so "Overview" doesn't stay active on sub-pages
    return currentPath === itemPath
  }
  // For global nav: dashboard is exact, others use startsWith
  if (itemPath === '/') {
    return currentPath === '/'
  }
  return currentPath.startsWith(itemPath)
}

function HamburgerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <line x1="3" y1="5" x2="17" y2="5" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="15" x2="17" y2="15" />
    </svg>
  )
}
