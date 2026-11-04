import { Box, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card, Progress } from '@/components/ui/Card'
import { deadlineState, isUrgent, suggestFinishDate, type JobPlan } from '@/domain/calc'
import type { Job } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatDate, formatInt, formatMinutes, formatPercent } from '@/lib/format'
import { DeadlineBadge, KIND_LABEL, PRIORITY_META, StatusBadge } from './meta'

interface Props {
  job: Job
  plan: JobPlan
  today: string
  hoursPerDay: number
}

export function JobCard({ job, plan, today, hoursPerDay }: Props) {
  const suggested = suggestFinishDate(plan.remaining.minutes, hoursPerDay, today)
  const state = deadlineState(job, plan.remaining.minutes > 0 ? suggested : null, today)
  const urgent = isUrgent(job, today)
  const tone = state === 'overdue' ? 'danger' : state === 'at_risk' || state === 'due_soon' ? 'warn' : 'accent'

  return (
    <Link to={`/jobs/${job.id}`} className="group block rounded-card focus-visible:outline-offset-4">
      <Card
        className={cn(
          'flex gap-4 p-4 transition-colors group-hover:border-line-strong group-hover:bg-raised',
          urgent && 'border-warn/35 shadow-[inset_3px_0_0_var(--color-warn)]',
          state === 'overdue' && 'border-danger/40 shadow-[inset_3px_0_0_var(--color-danger)]',
          job.archived_at && 'opacity-60',
        )}
      >
        <div className="grid size-14 shrink-0 place-items-center rounded-xl border border-line bg-raised text-faint" aria-hidden>
          <Box className="size-6" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate text-[15px] font-semibold">{job.name}</h3>
            {job.is_mandatory && (
              <Badge tone="warn"><Lock className="size-3" aria-hidden />Obligatorio</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={job.status} />
            <Badge>{KIND_LABEL[job.kind]}</Badge>
            {job.priority !== 'normal' && <Badge tone={PRIORITY_META[job.priority].tone}>Prioridad {PRIORITY_META[job.priority].label.toLowerCase()}</Badge>}
            <DeadlineBadge state={state} due={job.due_date} today={today} />
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
              <span className="tabular-nums">
                <span className="font-medium text-fg">{formatInt(plan.unitsCompleted)}</span> / {formatInt(job.quantity)} uds · {formatPercent(plan.progress)}
              </span>
              <span className="tabular-nums">{plan.remaining.minutes > 0 ? `${formatMinutes(plan.remaining.minutes)} restantes` : plan.components.length === 0 ? 'Sin componentes' : '—'}</span>
            </div>
            <Progress value={plan.progress} tone={tone} label={`Progreso de ${job.name}`} />
          </div>
          <p className="text-xs text-faint">Entrega {formatDate(job.due_date)}{job.client_name ? ` · ${job.client_name}` : ''}</p>
        </div>
      </Card>
    </Link>
  )
}
