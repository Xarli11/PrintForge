import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-surface', className)} {...p} />
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{children}</h2>
      {action}
    </div>
  )
}

const tones = {
  neutral: 'bg-raised text-muted border-line',
  accent: 'bg-accent/10 text-accent-fg border-accent/25',
  info: 'bg-info/10 text-info border-info/25',
  warn: 'bg-warn/10 text-warn border-warn/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  violet: 'bg-violet/10 text-violet border-violet/25',
} as const
export type Tone = keyof typeof tones

export function Badge({ tone = 'neutral', children, wrap }: { tone?: Tone; children: ReactNode; wrap?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', wrap ? 'max-w-full' : 'whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  )
}

export function Progress({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'warn' | 'danger'; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const color = { accent: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger' }[tone]
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'danger' | 'accent' }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn('text-2xl font-semibold tracking-tight tabular-nums', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger', tone === 'accent' && 'text-accent-fg')}>
        {value}
      </span>
      {sub && <span className="text-xs text-faint">{sub}</span>}
    </Card>
  )
}
