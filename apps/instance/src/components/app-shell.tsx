import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  CalendarDays,
  Church,
  GraduationCap,
  HandCoins,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'

import { useApiQuery, useChurchRealtime } from '@/lib/api'
import { useAuthState, SignInButton } from '@/lib/auth-provider'
import { useThemeMode, type ThemeMode } from '@/lib/theme-mode'
import type { Church as ChurchRecord } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ChurchTheme } from '@/components/church-theme'

// ---------------------------------------------------------------------------
// Navigation definitions
// ---------------------------------------------------------------------------

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** A note shown as a smaller label */
  note?: string
  permission?: string
}

const globalNav: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Church', path: '/churches', icon: Church },
]

const churchNav: NavItem[] = [
  { label: 'Overview', path: '', icon: LayoutDashboard },
  { label: 'People', path: '/people', icon: Users },
  { label: 'Groups', path: '/groups', icon: UsersRound },
  { label: 'Courses', path: '/courses', icon: GraduationCap },
  { label: 'Events', path: '/events', icon: CalendarDays },
  { label: 'Sermons', path: '/sermons', icon: Mic },
  { label: 'Media', path: '/media', icon: Image },
  // Facilities is intentionally absent: the `facilities` and
  // `facility_bookings` tables exist but have no API routes or UI yet, so the
  // nav entry resolved to the 404 page. Restore it with the route.
  { label: 'Contributions', path: '/contributions', icon: HandCoins, note: 'Finance' },
  {
    label: 'Management',
    path: '/management',
    icon: ShieldCheck,
    note: 'Owner',
    permission: 'management.admin',
  },
]

const SIDEBAR_WIDTH = 'w-60'

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

  const churchQuery = useApiQuery<{ church: ChurchRecord }>(
    activeChurchId ? `/api/churches/${encodeURIComponent(activeChurchId)}` : null,
  )
  const church = churchQuery.data?.church
  useChurchRealtime(activeChurchId)

  const churchBasePath = activeChurchId ? `/churches/${activeChurchId}` : null
  const permissions =
    user?.memberships.find((entry) => entry.churchId === activeChurchId)?.permissions ?? []

  // Close the drawer on navigation — leaving it open over the new page is the
  // most common mobile navigation bug in a shell like this.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Escape closes the drawer.
  useEffect(() => {
    if (!sidebarOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  return (
    <div className="min-h-screen bg-background">
      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface-chrome px-3 lg:hidden">
        <Button
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
          aria-label="Open navigation"
          onClick={() => setSidebarOpen(true)}
          size="icon-sm"
          variant="ghost"
        >
          <Menu />
        </Button>
        <Wordmark />
        <div className="flex-1" />
        {isSignedIn && user ? (
          <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} size="sm" />
        ) : authLoading ? null : (
          <SignInButton />
        )}
      </header>

      {/* ── Drawer scrim ───────────────────────────────────────────────── */}
      {sidebarOpen ? (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar-background',
          SIDEBAR_WIDTH,
          'transition-transform duration-200 ease-brand lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        id="app-sidebar"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <Wordmark />
          <div className="flex-1" />
          <Button
            aria-label="Close navigation"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            size="icon-sm"
            variant="ghost"
          >
            <X />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          <NavGroup>
            {globalNav.map((item) => (
              <NavLink
                item={item}
                key={item.path}
                active={isNavActive(location.pathname, item.path)}
                to={item.path}
              />
            ))}
          </NavGroup>

          {churchBasePath ? (
            <>
              <ChurchBadge church={church} churchId={activeChurchId} />
              <NavGroup>
                {churchNav.map((item) => {
                  if (
                    item.permission &&
                    !permissions.includes('*') &&
                    !permissions.includes(item.permission)
                  ) {
                    return null
                  }
                  const fullPath = `${churchBasePath}${item.path}`
                  return (
                    <NavLink
                      item={item}
                      key={item.path}
                      active={isNavActive(location.pathname, fullPath)}
                      to={fullPath}
                    />
                  )
                })}
              </NavGroup>
            </>
          ) : null}
        </nav>

        <SidebarFooter />
      </aside>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="lg:pl-60">{children}</main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar building blocks
// ---------------------------------------------------------------------------

function Wordmark() {
  return (
    <Link
      className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm font-semibold tracking-tight"
      to="/"
    >
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-md bg-primary text-[0.6875rem] font-bold text-primary-foreground"
      >
        42
      </span>
      <span className="text-foreground">Fellowship42</span>
    </Link>
  )
}

function NavGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-px py-1">{children}</div>
}

function NavLink({ active, item, to }: { active: boolean; item: NavItem; to: string }) {
  const Icon = item.icon
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-md px-2 text-[0.8125rem] font-medium',
        'transition-colors duration-150 ease-brand',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
      )}
      to={to}
    >
      <Icon
        aria-hidden
        className={cn('size-4 shrink-0', active ? 'text-sidebar-primary' : 'text-muted-foreground')}
      />
      <span className="truncate">{item.label}</span>
      {item.note ? (
        <span className="ml-auto shrink-0 text-[0.6875rem] font-normal text-muted-foreground">
          {item.note}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * The one place a congregation's own color appears in the operator chrome:
 * a small mark identifying whose data is on screen. Everything else stays in
 * the product palette so the UI is equally legible for every church.
 */
function ChurchBadge({
  church,
  churchId,
}: {
  church?: ChurchRecord
  churchId: string | null
}) {
  if (!churchId) return null
  const name = church?.name ?? 'Church'

  return (
    <ChurchTheme theme={church?.theme} className="mt-3 mb-1 px-2">
      <div className="mb-1.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
        Church
      </div>
      <Link
        className="flex items-center gap-2 rounded-md border border-border bg-card p-1.5 transition-colors duration-150 hover:border-border-strong"
        to={`/churches/${churchId}`}
      >
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-[0.6875rem] font-semibold"
          style={{
            background: 'var(--church-accent)',
            color: 'var(--church-accent-contrast)',
          }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-[0.8125rem] font-medium">{name}</span>
      </Link>
    </ChurchTheme>
  )
}

function SidebarFooter() {
  const { isSignedIn, isLoading, user } = useAuthState()

  return (
    <div className="shrink-0 border-t border-sidebar-border p-2">
      <ThemeToggle />
      <div className="mt-2 flex items-center gap-2 rounded-md px-1 py-1">
        {isLoading ? (
          <span className="text-xs text-muted-foreground">Checking session…</span>
        ) : isSignedIn && user ? (
          <>
            <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
              {user.firstName} {user.lastName}
            </span>
            <Button aria-label="Sign out" asChild size="icon-xs" variant="ghost">
              <a href="/cdn-cgi/access/logout">
                <LogOut />
              </a>
            </Button>
          </>
        ) : (
          <SignInButton className="w-full" />
        )}
      </div>
    </div>
  )
}

const themeOptions: Array<{ value: ThemeMode; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function ThemeToggle() {
  const { mode, setMode } = useThemeMode()

  return (
    <div
      aria-label="Color theme"
      className="flex items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5"
      role="radiogroup"
    >
      {themeOptions.map((option) => {
        const Icon = option.icon
        const selected = mode === option.value
        return (
          <button
            aria-checked={selected}
            className={cn(
              'flex h-6 flex-1 items-center justify-center rounded-sm transition-colors duration-150',
              selected
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            key={option.value}
            onClick={() => setMode(option.value)}
            role="radio"
            title={option.label}
            type="button"
          >
            <Icon aria-hidden className="size-3.5" />
            <span className="sr-only">{option.label}</span>
          </button>
        )
      })}
    </div>
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

/**
 * Determine if a nav item should be marked active.
 *
 * Every item matches exactly. A prefix match on the global "Church" entry
 * lit it up on every church-scoped page, so the sidebar showed two selected
 * items at once — "Church" and whichever church section you were actually in.
 * The church's own pages are represented by the church nav group below it,
 * not by the top-level entry.
 */
function isNavActive(currentPath: string, itemPath: string): boolean {
  return currentPath === itemPath
}
