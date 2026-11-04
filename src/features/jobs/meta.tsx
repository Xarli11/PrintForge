import { AlertTriangle, CalendarClock, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge, type Tone } from '@/components/ui/Card'
import type { DeadlineState } from '@/domain/calc'
import { diffDays } from '@/domain/dates'
import type { JobKind, JobStatus, Priority } from '@/domain/types'
import { formatRelativeDays } from '@/lib/format'

export const STATUS_META: Record<JobStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pendiente', tone: 'neutral' },
  preparing: { label: 'Preparando', tone: 'info' },
  printing: { label: 'Imprimiendo', tone: 'accent' },
  postprocessing: { label: 'Postprocesado', tone: 'violet' },
  done: { label: 'Terminado', tone: 'accent' },
  delivered: { label: 'Entregado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
}

export const PRIORITY_META: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: 'Baja', tone: 'neutral' },
  normal: { label: 'Normal', tone: 'neutral' },
  high: { label: 'Alta', tone: 'warn' },
  urgent: { label: 'Urgente', tone: 'danger' },
}

export const KIND_LABEL: Record<JobKind, string> = { personal: 'Personal', commission: 'Encargo' }

export const statusOptions = (Object.keys(STATUS_META) as JobStatus[]).map((v) => ({ value: v, label: STATUS_META[v].label }))
export const priorityOptions = (Object.keys(PRIORITY_META) as Priority[]).map((v) => ({ value: v, label: PRIORITY_META[v].label }))

export const StatusBadge = ({ status }: { status: JobStatus }) => <Badge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Badge>

/** Etiqueta de plazo: sólo aparece cuando hay algo que decir (vencido, en riesgo o inminente). */
export function DeadlineBadge({ state, due, today }: { state: DeadlineState; due: string; today: string }): ReactNode {
  const days = diffDays(due, today)
  if (state === 'overdue') return <Badge tone="danger"><AlertTriangle className="size-3" aria-hidden />Vencido {formatRelativeDays(days)}</Badge>
  if (state === 'at_risk') return <Badge tone="warn"><AlertTriangle className="size-3" aria-hidden />Estimado fuera de plazo</Badge>
  if (state === 'due_soon') return <Badge tone="warn"><Clock className="size-3" aria-hidden />Vence {formatRelativeDays(days)}</Badge>
  if (state === 'ok') return <Badge><CalendarClock className="size-3" aria-hidden />{formatRelativeDays(days)}</Badge>
  return null
}
