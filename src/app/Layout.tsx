import { Link, NavLink, Outlet } from 'react-router'
import { cn } from '@/lib/utils'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'
import { ThemeToggle } from './ThemeToggle'

const NAV_ITEMS = [
  { to: '/', label: 'Spiele', end: true },
  { to: '/stats', label: 'Statistik', end: false },
  { to: '/settings', label: 'Einstellungen', end: false },
] as const

export function Layout() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="app-bar sticky top-0 z-40 border-b bg-background/90 pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-safe">
          <Link
            to="/"
            aria-label="Cards – zur Spielauswahl"
            className="flex items-center gap-2 font-semibold"
          >
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7" />
            <span className="hidden text-lg tracking-tight sm:inline">Cards</span>
          </Link>
          <nav aria-label="Hauptnavigation" className="ml-auto flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3',
                    isActive && 'bg-accent text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="app-bar-body mx-auto w-full max-w-6xl flex-1 pt-6 px-safe pb-6 sm:pt-10">
        <Outlet />
      </main>
      <footer className="mx-auto w-full max-w-6xl border-t py-4 px-safe pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
        Cards v{__APP_VERSION__} · by Lucas Nagelsmann
      </footer>
      <PwaUpdatePrompt />
    </div>
  )
}
