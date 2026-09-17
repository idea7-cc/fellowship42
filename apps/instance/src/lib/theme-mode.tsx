import * as React from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'f42.theme'

interface ThemeModeState {
  /** What the operator chose. */
  mode: ThemeMode
  /** What is actually on screen once `system` is resolved. */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

const ThemeModeContext = React.createContext<ThemeModeState | null>(null)

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system')
      return stored
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Fall through.
  }
  return 'system'
}

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/**
 * Applies the theme to <html>.
 *
 * Kept as a module-level function so the pre-paint script in index.html and
 * React apply the class the same way — a mismatch there is what produces the
 * white flash on load for operators who work in dark mode.
 */
export function applyThemeMode(mode: ThemeMode): 'light' | 'dark' {
  const resolved = mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
  return resolved
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ThemeMode>(readStoredMode)
  const [resolved, setResolved] = React.useState<'light' | 'dark'>(() =>
    typeof document === 'undefined'
      ? 'light'
      : applyThemeMode(readStoredMode()),
  )

  const setMode = React.useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A non-persisted preference still applies for this session.
    }
    setResolved(applyThemeMode(next))
  }, [])

  // Follow the OS while the operator is on `system`.
  React.useEffect(() => {
    if (mode !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolved(applyThemeMode('system'))
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [mode])

  const value = React.useMemo<ThemeModeState>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  )

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode(): ThemeModeState {
  const state = React.useContext(ThemeModeContext)
  if (!state)
    throw new Error('useThemeMode must be used inside ThemeModeProvider')
  return state
}
