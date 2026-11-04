import { Inbox, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { SectionTitle, Stat } from '@/components/ui/Card'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { isActiveJob, isUrgent } from '@/domain/calc'
import { todayISO } from '@/domain/dates'
import { useWorkspace, type Workspace } from '@/data/hooks'
import type { Job } from '@/domain/types'
import { formatGrams, formatInt, formatMinutes } from '@/lib/format'
import { JobCard } from '@/features/jobs/JobCard'
import { JobFormDialog } from '@/features/jobs/JobFormDialog'
import { useJobThumbs } from '@/features/jobs/thumbs'

export function DashboardPage() {
  const { workspace: ws, isLoading, error, refetch } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const today = useMemo(() => todayISO(), [])

  const view = useMemo(() => {
    if (!ws) return null
    const live = ws.jobs.filter((j) => !j.archived_at)
    const active = live.filter(isActiveJob)
    const plan = (id: string) => ws.plans.get(id)!
    return {
      active,
      pending: active.filter((j) => j.status === 'pending').length,
      mandatory: active.filter((j) => j.is_mandatory).length,
      inProgress: active.filter((j) => ['preparing', 'printing', 'postprocessing'].includes(j.status)),
      finished: live.filter((j) => j.status === 'done' || j.status === 'delivered').length,
      unitsPending: active.reduce((s, j) => s + plan(j.id).unitsPending, 0),
      minutesLeft: active.reduce((s, j) => s + plan(j.id).remaining.minutes, 0),
      gramsLeft: active.reduce((s, j) => s + plan(j.id).remaining.grams, 0),
      urgent: active.filter((j) => isUrgent(j, today)).sort((a, b) => a.due_date.localeCompare(b.due_date)),
      upcoming: [...active].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5),
      recent: [...live].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
    }
  }, [ws, today])

  const thumbs = useJobThumbs(ws, view ? [...view.urgent, ...view.inProgress, ...view.upcoming, ...view.recent] : [])

  const newJobButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus className="size-4" aria-hidden />
      Nuevo trabajo
    </Button>
  )

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Tu producción de un vistazo" actions={newJobButton} />
      <div className="flex flex-col gap-8 px-4 md:px-8">
        {isLoading && <Loading />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {ws && view && (
          <>
            <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Trabajos pendientes" value={formatInt(view.pending)} />
              <Stat label="Encargos obligatorios" value={formatInt(view.mandatory)} tone={view.mandatory > 0 ? 'warn' : undefined} />
              <Stat label="En curso" value={formatInt(view.inProgress.length)} tone="accent" />
              <Stat label="Terminados" value={formatInt(view.finished)} />
              <Stat label="Unidades pendientes" value={formatInt(view.unitsPending)} />
              <Stat label="Horas restantes" value={formatMinutes(view.minutesLeft)} sub="Estimación" />
              <Stat label="Material necesario" value={view.gramsLeft > 0 ? formatGrams(view.gramsLeft) : '—'} sub={view.gramsLeft > 0 ? 'Estimación' : 'Sin consumos registrados'} />
            </section>

            {view.active.length === 0 ? (
              <EmptyState
                icon={<Inbox className="size-8" />}
                title="No hay trabajos activos"
                text="Crea tu primer trabajo: define la cantidad, la fecha de entrega y añade sus componentes."
                action={newJobButton}
              />
            ) : (
              <div className="grid gap-8 xl:grid-cols-2">
                {view.urgent.length > 0 && <Group title="Encargos urgentes" ws={ws} jobs={view.urgent} today={today} thumbs={thumbs} />}
                {view.inProgress.length > 0 && <Group title="Impresiones actuales" ws={ws} jobs={view.inProgress} today={today} thumbs={thumbs} />}
                <Group title="Próximas entregas" ws={ws} jobs={view.upcoming} today={today} thumbs={thumbs} />
                <Group title="Últimos trabajos modificados" ws={ws} jobs={view.recent} today={today} thumbs={thumbs} />
              </div>
            )}
          </>
        )}
      </div>
      <JobFormDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function Group({ title, jobs, ws, today, thumbs }: { title: string; jobs: Job[]; ws: Workspace; today: string; thumbs: Map<string, string> }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="flex flex-col gap-3">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} plan={ws.plans.get(j.id)!} today={today} hoursPerDay={ws.settings.hours_per_day} thumbUrl={thumbs.get(j.id)} />
        ))}
      </div>
    </section>
  )
}
