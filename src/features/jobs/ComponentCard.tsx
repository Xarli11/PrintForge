import { AlertTriangle, Minus, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge, Card, Progress } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useDeleteComponent, useLogProduction } from '@/data/hooks'
import { checkCompleted, type ComponentPlan } from '@/domain/calc'
import type { Job, JobComponent } from '@/domain/types'
import { formatInt, formatMinutes, formatPercent } from '@/lib/format'
import { ComponentFormDialog } from './ComponentFormDialog'
import { ProductionDialog } from './ProductionDialog'

interface Props {
  job: Job
  component: JobComponent
  plan: ComponentPlan
  nextPosition: number
}

export function ComponentCard({ job, component: c, plan, nextPosition }: Props) {
  const log = useLogProduction()
  const del = useDeleteComponent()
  const [editing, setEditing] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [overflow, setOverflow] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function add(delta: number, failed = 0) {
    setError(null)
    try {
      await log.mutateAsync({ componentId: c.id, completed: delta, failed, note: failed ? 'Fallo' : '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar')
    }
  }

  /** Avisa antes de registrar más piezas de las necesarias. */
  function tryAdd(delta: number) {
    const issue = checkCompleted(c.completed_qty + delta, plan.piecesNeeded)
    if (issue === 'negative') return
    if (issue === 'exceeds_needed') return setOverflow(delta)
    void add(delta)
  }

  const done = plan.piecesPending === 0 && plan.piecesNeeded > 0
  const step = Math.min(c.batch_capacity, Math.max(1, plan.piecesPending))

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{c.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {c.qty_per_unit} por producto · {c.batch_capacity} por tanda
            {c.description ? ` · ${c.description}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" aria-label={`Editar ${c.name}`} onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Eliminar ${c.name}`} onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="tabular-nums">
            <span className="text-lg font-semibold">{formatInt(plan.piecesCompleted)}</span>
            <span className="text-muted"> / {formatInt(plan.piecesNeeded)} piezas</span>
          </span>
          <span className="text-muted tabular-nums">{formatPercent(plan.progress)}</span>
        </div>
        <Progress value={plan.progress} tone={plan.overproduced ? 'warn' : 'accent'} label={`Progreso de ${c.name}`} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Metric label="Piezas pendientes" value={formatInt(plan.piecesPending)} />
        <Metric label="Impresiones restantes" value={`${formatInt(plan.remaining.batches)} de ${formatInt(plan.total.batches)}`} />
        <Metric label="Tiempo restante" value={c.batch_minutes > 0 ? formatMinutes(plan.remaining.minutes) : '—'} hint={c.batch_minutes > 0 ? 'Estimación' : undefined} />
        <Metric label="Tiempo por tanda" value={c.batch_minutes > 0 ? formatMinutes(c.batch_minutes) : '—'} />
      </dl>

      <div className="flex flex-wrap gap-1.5 empty:hidden">
        {c.batch_minutes === 0 && <Badge tone="warn"><AlertTriangle className="size-3" aria-hidden />Sin tiempo por tanda</Badge>}
        {plan.partialPieces != null && plan.partialIsConservative && c.batch_minutes > 0 && (
          <Badge tone="warn" wrap>
            Última tanda de {plan.partialPieces} {plan.partialPieces === 1 ? 'pieza' : 'piezas'}: estimación conservadora (tiempo de tanda completa)
          </Badge>
        )}
        {plan.overproduced && <Badge tone="warn"><TriangleAlert className="size-3" aria-hidden />Más piezas de las necesarias</Badge>}
        {c.failed_qty > 0 && <Badge tone="danger">{c.failed_qty} {c.failed_qty === 1 ? 'fallida' : 'fallidas'}</Badge>}
        {done && <Badge tone="accent">Completado</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button size="sm" aria-label={`Quitar una pieza de ${c.name}`} disabled={c.completed_qty === 0 || log.isPending} onClick={() => tryAdd(-1)}>
          <Minus className="size-4" />
        </Button>
        <Button size="sm" variant="primary" disabled={log.isPending} onClick={() => tryAdd(1)} aria-label={`Sumar una pieza a ${c.name}`}>
          <Plus className="size-4" />1
        </Button>
        {c.batch_capacity > 1 && step > 1 && (
          <Button size="sm" disabled={log.isPending} onClick={() => tryAdd(step)} aria-label={`Sumar una tanda de ${step} piezas a ${c.name}`}>
            <Plus className="size-4" />{step} (tanda)
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={log.isPending} onClick={() => void add(0, 1)} aria-label={`Registrar fallo en ${c.name}`}>
          Fallo
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setRegistering(true)}>
          Ajustar…
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <ComponentFormDialog open={editing} onClose={() => setEditing(false)} job={job} component={c} nextPosition={nextPosition} />
      <ProductionDialog open={registering} onClose={() => setRegistering(false)} component={c} plan={plan} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        danger
        title="Eliminar componente"
        message={`Se eliminará «${c.name}» con su historial de producción. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => del.mutateAsync(c.id)}
      />
      <ConfirmDialog
        open={overflow != null}
        onClose={() => setOverflow(null)}
        title="Cantidad superior a la necesaria"
        message={`Registrarás ${c.completed_qty + (overflow ?? 0)} piezas de ${plan.piecesNeeded} necesarias. ¿Quieres hacerlo igualmente?`}
        confirmLabel="Registrar igualmente"
        onConfirm={() => add(overflow ?? 0)}
      />
    </Card>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">
        {value}
        {hint && <span className="ml-1.5 text-[10px] font-normal tracking-wide text-faint uppercase">{hint}</span>}
      </dd>
    </div>
  )
}
