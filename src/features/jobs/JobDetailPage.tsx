import { Archive, ArchiveRestore, ArrowLeft, CheckCircle2, Copy, Lock, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { Badge, Card, SectionTitle, Stat } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Form'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { useDeleteJob, useDuplicateJob, useUpdateJob, useWorkspace } from '@/data/hooks'
import { deadlineState, isActiveJob, suggestFinishDate } from '@/domain/calc'
import { diffDays, todayISO } from '@/domain/dates'
import type { JobStatus } from '@/domain/types'
import { formatDate, formatGrams, formatInt, formatMinutes, formatMoney, formatPercent } from '@/lib/format'
import { ComponentCard } from './ComponentCard'
import { ComponentFormDialog } from './ComponentFormDialog'
import { JobFormDialog } from './JobFormDialog'
import { DeadlineBadge, KIND_LABEL, PRIORITY_META, StatusBadge, statusOptions } from './meta'

export function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { workspace: ws, isLoading, error, refetch } = useWorkspace()
  const update = useUpdateJob()
  const duplicate = useDuplicateJob()
  const remove = useDeleteJob()
  const [editing, setEditing] = useState(false)
  const [addingComponent, setAddingComponent] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const today = useMemo(() => todayISO(), [])

  const job = ws?.jobs.find((j) => j.id === id)
  const plan = job && ws ? ws.plans.get(job.id) : undefined
  const components = (job && ws?.componentsByJob.get(job.id)) || []

  if (isLoading) return <Loading />
  if (error) return <div className="p-4 md:p-8"><ErrorState error={error} onRetry={refetch} /></div>
  if (!ws || !job || !plan) {
    return (
      <div className="p-4 md:p-8">
        <EmptyState icon={<TriangleAlert className="size-8" />} title="Trabajo no encontrado" action={<Link to="/jobs"><Button>Volver a trabajos</Button></Link>} />
      </div>
    )
  }

  const hoursPerDay = ws.settings.hours_per_day
  const suggested = plan.remaining.minutes > 0 ? suggestFinishDate(plan.remaining.minutes, hoursPerDay, today) : null
  const state = deadlineState(job, suggested, today)
  const manualLate = job.estimated_finish_date != null && diffDays(job.estimated_finish_date, job.due_date) > 0
  const suggestedLate = suggested != null && diffDays(suggested, job.due_date) > 0
  const allDone = components.length > 0 && plan.components.every((c) => c.piecesPending === 0)
  const nextPosition = components.reduce((m, c) => Math.max(m, c.position + 1), 0)
  const hasFilament = plan.total.grams > 0

  async function guarded(fn: () => Promise<unknown>) {
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'La operación ha fallado')
    }
  }

  const setStatus = (status: JobStatus) => guarded(() => update.mutateAsync({ id: job.id, patch: { status } }))

  return (
    <>
      <div className="px-4 pt-5 md:px-8 md:pt-7">
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          Trabajos
        </Link>
      </div>
      <PageHeader
        title={job.name}
        subtitle={[KIND_LABEL[job.kind], job.client_name].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button size="sm" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden />Editar</Button>
            <Button size="sm" loading={duplicate.isPending} onClick={() => guarded(async () => navigate(`/jobs/${await duplicate.mutateAsync(job.id)}`))}>
              <Copy className="size-4" aria-hidden />Duplicar
            </Button>
            <Button size="sm" onClick={() => guarded(() => update.mutateAsync({ id: job.id, patch: { archived_at: job.archived_at ? null : new Date().toISOString() } }))}>
              {job.archived_at ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
              {job.archived_at ? 'Restaurar' : 'Archivar'}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleting(true)} aria-label="Eliminar trabajo"><Trash2 className="size-4" /></Button>
          </>
        }
      />

      <div className="flex flex-col gap-8 px-4 md:px-8">
        {actionError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <Select aria-label="Estado del trabajo" value={job.status} onChange={(e) => void setStatus(e.target.value as JobStatus)}>
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <StatusBadge status={job.status} />
          {job.is_mandatory && <Badge tone="warn"><Lock className="size-3" aria-hidden />Obligatorio</Badge>}
          <Badge tone={PRIORITY_META[job.priority].tone}>Prioridad {PRIORITY_META[job.priority].label.toLowerCase()}</Badge>
          <DeadlineBadge state={state} due={job.due_date} today={today} />
          {job.archived_at && <Badge>Archivado</Badge>}
        </div>

        {(manualLate || suggestedLate) && isActiveJob(job) && (
          <div role="alert" className="flex gap-3 rounded-card border border-warn/35 bg-warn/10 p-4 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {manualLate
                ? `La fecha estimada (${formatDate(job.estimated_finish_date)}) es posterior a la fecha límite (${formatDate(job.due_date)}).`
                : `Con ${hoursPerDay} h de impresión al día, la finalización orientativa (${formatDate(suggested)}) supera la fecha límite (${formatDate(job.due_date)}).`}
            </p>
          </div>
        )}

        {allDone && job.status !== 'done' && job.status !== 'delivered' && job.status !== 'cancelled' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/30 bg-accent/10 p-4">
            <p className="flex items-center gap-2 text-sm text-accent-fg"><CheckCircle2 className="size-4" aria-hidden />Todos los componentes están completos.</p>
            <Button size="sm" variant="primary" onClick={() => void setStatus('done')}>Marcar como terminado</Button>
          </div>
        )}

        <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Progreso" value={formatPercent(plan.progress)} sub={`${formatInt(plan.unitsCompleted)} de ${formatInt(job.quantity)} productos completos`} tone="accent" />
          <Stat label="Impresiones restantes" value={formatInt(plan.remaining.batches)} sub={`de ${formatInt(plan.total.batches)} en total`} />
          <Stat label="Tiempo restante" value={plan.remaining.minutes > 0 ? formatMinutes(plan.remaining.minutes) : '—'} sub="Estimación" />
          <Stat label="Entrega" value={formatDate(job.due_date)} sub={job.estimated_finish_date ? `Estimada ${formatDate(job.estimated_finish_date)}` : 'Sin fecha estimada'} tone={state === 'overdue' ? 'danger' : state === 'at_risk' || state === 'due_soon' ? 'warn' : undefined} />
        </section>

        <section>
          <SectionTitle
            action={<Button size="sm" variant="primary" onClick={() => setAddingComponent(true)}><Plus className="size-4" aria-hidden />Componente</Button>}
          >
            Componentes
          </SectionTitle>
          {components.length === 0 ? (
            <EmptyState
              icon={<Plus className="size-8" />}
              title="Este trabajo aún no tiene componentes"
              text="Añade las piezas que forman cada producto (figura, peana…) para calcular impresiones, tiempo y material."
              action={<Button variant="primary" onClick={() => setAddingComponent(true)}>Añadir componente</Button>}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {components.map((c) => (
                <ComponentCard key={c.id} job={job} component={c} plan={plan.components.find((p) => p.componentId === c.id)!} nextPosition={nextPosition} />
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <SectionTitle>Cálculos <span className="ml-1 font-normal normal-case tracking-normal text-faint">· estimaciones</span></SectionTitle>
            <Card className="divide-y divide-line text-sm">
              <Row label="Piezas necesarias" value={formatInt(plan.piecesNeeded)} />
              <Row label="Impresiones totales" value={formatInt(plan.total.batches)} />
              <Row label="Impresiones pendientes" value={formatInt(plan.remaining.batches)} />
              <Row label="Tiempo total" value={formatMinutes(plan.total.minutes)} />
              <Row label="Tiempo restante" value={formatMinutes(plan.remaining.minutes)} />
              {hasFilament ? (
                <>
                  <Row label="Filamento necesario" value={formatGrams(plan.total.grams)} />
                  <Row label="Filamento pendiente" value={formatGrams(plan.remaining.grams)} />
                  <Row label="Coste de filamento" value={formatMoney(plan.total.filamentCost, ws.settings.currency)} />
                  <Row label="Coste eléctrico aprox." value={formatMoney(plan.total.electricityCost, ws.settings.currency)} />
                  {job.extra_costs > 0 && <Row label="Costes adicionales" value={formatMoney(job.extra_costs, ws.settings.currency)} />}
                  <Row label="Coste total estimado" value={formatMoney(plan.totalCost, ws.settings.currency)} strong />
                  {plan.margin != null && <Row label={`Margen estimado (venta ${formatMoney(job.sale_price ?? 0, ws.settings.currency)})`} value={formatMoney(plan.margin, ws.settings.currency)} strong tone={plan.margin < 0 ? 'danger' : 'accent'} />}
                </>
              ) : (
                <p className="px-4 py-3 text-xs text-muted">Los costes y el material aparecerán cuando registres el consumo de filamento de los componentes.</p>
              )}
            </Card>
            {plan.hasConservativeEstimate && <p className="mt-2 text-xs text-faint">Las tandas parciales se calculan con el tiempo de una tanda completa salvo que indiques el tiempo de la última.</p>}
          </section>

          <section>
            <SectionTitle>Fechas</SectionTitle>
            <Card className="divide-y divide-line text-sm">
              <Row label="Fecha límite" value={formatDate(job.due_date)} />
              <Row label="Estimada (manual)" value={formatDate(job.estimated_finish_date)} tone={manualLate ? 'warn' : undefined} />
              <Row label={`Orientativa (${hoursPerDay} h/día)`} value={suggested ? formatDate(suggested) : '—'} tone={suggestedLate ? 'warn' : undefined} />
              <Row label="Creado" value={formatDate(job.created_at)} />
              <Row label="Finalización real" value={formatDate(job.completed_at)} />
            </Card>
            <p className="mt-2 text-xs text-faint">La fecha orientativa asume impresión continua a ese ritmo diario; no es una planificación exacta.</p>
          </section>
        </div>

        {(job.description || job.notes) && (
          <section>
            <SectionTitle>Notas</SectionTitle>
            <Card className="flex flex-col gap-3 p-4 text-sm whitespace-pre-wrap text-muted">
              {job.description && <p>{job.description}</p>}
              {job.notes && <p>{job.notes}</p>}
            </Card>
          </section>
        )}
      </div>

      <JobFormDialog open={editing} onClose={() => setEditing(false)} job={job} />
      <ComponentFormDialog open={addingComponent} onClose={() => setAddingComponent(false)} job={job} nextPosition={nextPosition} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        danger
        title="Eliminar trabajo"
        message={`Se eliminará «${job.name}» junto con sus componentes y su historial. Para conservarlo sin saturar el dashboard, archívalo en su lugar.`}
        confirmLabel="Eliminar definitivamente"
        onConfirm={async () => {
          await remove.mutateAsync(job.id)
          navigate('/jobs')
        }}
      />
    </>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: ReactNode; strong?: boolean; tone?: 'warn' | 'danger' | 'accent' }) {
  const color = tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent-fg' : ''
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''} ${color}`}>{value}</span>
    </div>
  )
}
