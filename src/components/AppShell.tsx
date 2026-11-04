import { Library, LayoutDashboard, ListChecks, LogOut, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/cn'
import { Logo } from './Logo'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/jobs', label: 'Trabajos', icon: ListChecks },
  { to: '/library', label: 'Biblioteca', icon: Library },
  { to: '/settings', label: 'Ajustes', icon: SettingsIcon },
]

export function AppShell() {
  const { signOut } = useAuth()
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo className="size-8" />
          <span className="text-[15px] font-semibold tracking-tight">PrintForge</span>
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                  isActive ? 'bg-accent/10 text-accent-fg' : 'text-muted hover:bg-raised hover:text-fg',
                )
              }
            >
              <Icon className="size-4.5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <LogOut className="size-4.5" aria-hidden />
          Cerrar sesión
        </button>
      </aside>

      <div className="min-w-0 pb-24 md:pb-10">
        <Outlet />
      </div>

      {/* Navegación inferior (móvil) */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex h-14 flex-col items-center justify-center gap-1 text-[11px]', isActive ? 'text-accent-fg' : 'text-muted')
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-6 pb-5 md:px-8 md:pt-9">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
