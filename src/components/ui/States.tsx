import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
      {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-sm text-fg">No se pudieron cargar los datos</p>
      <p className="max-w-md text-xs break-words text-muted">{message}</p>
      {onRetry && <Button onClick={onRetry}>Reintentar</Button>}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="text-faint" aria-hidden>{icon}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {text && <p className="max-w-sm text-xs text-muted">{text}</p>}
      {action}
    </div>
  )
}
