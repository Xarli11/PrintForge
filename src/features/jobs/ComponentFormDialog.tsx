import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { useCreateComponent, useUpdateComponent } from '@/data/hooks'
import { batchesFor, piecesNeeded } from '@/domain/calc'
import { componentSchema, fieldErrors } from '@/domain/schemas'
import type { Job, JobComponent } from '@/domain/types'
import { formatInt, formatMinutes } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
  job: Job
  /** Si se pasa, edita ese componente; si no, crea uno nuevo al final de la lista. */
  component?: JobComponent
  nextPosition: number
}

interface FormState {
  name: string
  description: string
  qty_per_unit: string
  batch_capacity: string
  batch_minutes: string
  last_batch_minutes: string
  waste_grams_per_batch: string
  notes: string
}

const toNumber = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

export function ComponentFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.component ? 'Editar componente' : 'Nuevo componente'} wide>
      {props.open && <ComponentForm key={props.component?.id ?? 'new'} {...props} />}
    </Dialog>
  )
}

function ComponentForm({ onClose, job, component, nextPosition }: Props) {
  const create = useCreateComponent()
  const update = useUpdateComponent()
  const [f, setF] = useState<FormState>(() => ({
    name: component?.name ?? '',
    description: component?.description ?? '',
    qty_per_unit: String(component?.qty_per_unit ?? 1),
    batch_capacity: String(component?.batch_capacity ?? 1),
    batch_minutes: String(component?.batch_minutes ?? ''),
    last_batch_minutes: component?.last_batch_minutes == null ? '' : String(component.last_batch_minutes),
    waste_grams_per_batch: String(component?.waste_grams_per_batch ?? 0),
    notes: component?.notes ?? '',
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const set = (k: keyof FormState, v: string) => setF((s) => ({ ...s, [k]: v }))

  // Vista previa en vivo de lo que implican las cifras introducidas.
  const perUnit = toNumber(f.qty_per_unit)
  const capacity = toNumber(f.batch_capacity)
  const preview =
    Number.isInteger(perUnit) && perUnit >= 1 && Number.isInteger(capacity) && capacity >= 1
      ? { pieces: piecesNeeded(job.quantity, perUnit), batches: batchesFor(piecesNeeded(job.quantity, perUnit), capacity) }
      : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const parsed = componentSchema.safeParse({
      name: f.name,
      description: f.description,
      qty_per_unit: toNumber(f.qty_per_unit),
      batch_capacity: toNumber(f.batch_capacity),
      batch_minutes: f.batch_minutes.trim() === '' ? 0 : toNumber(f.batch_minutes),
      last_batch_minutes: f.last_batch_minutes.trim() === '' ? null : toNumber(f.last_batch_minutes),
      waste_grams_per_batch: f.waste_grams_per_batch.trim() === '' ? 0 : toNumber(f.waste_grams_per_batch),
      status: component?.status ?? 'pending',
      notes: f.notes,
    })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    try {
      if (component) await update.mutateAsync({ id: component.id, input: parsed.data })
      else await create.mutateAsync({ jobId: job.id, input: parsed.data, position: nextPosition })
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const minutesHint = (s: string, fallback: string) => {
    const n = toNumber(s)
    return Number.isFinite(n) && n > 0 ? `= ${formatMinutes(n)}` : fallback
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Nombre" error={errors.name}>
        {(p) => <Input {...p} autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Figura principal, Peana…" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Piezas por producto final" error={errors.qty_per_unit}>
          {(p) => <Input {...p} inputMode="numeric" value={f.qty_per_unit} onChange={(e) => set('qty_per_unit', e.target.value)} />}
        </Field>
        <Field label="Piezas que caben por tanda" hint="Cuántas salen en una misma impresión" error={errors.batch_capacity}>
          {(p) => <Input {...p} inputMode="numeric" value={f.batch_capacity} onChange={(e) => set('batch_capacity', e.target.value)} />}
        </Field>
        <Field label="Tiempo por tanda (minutos)" hint={minutesHint(f.batch_minutes, 'Una tanda completa, no una pieza. Vacío = sin definir')} error={errors.batch_minutes}>
          {(p) => <Input {...p} inputMode="numeric" value={f.batch_minutes} onChange={(e) => set('batch_minutes', e.target.value)} />}
        </Field>
        <Field label="Tiempo de la última tanda (opcional)" hint={minutesHint(f.last_batch_minutes, 'Si queda parcial; vacío = se usa una tanda completa')} error={errors.last_batch_minutes}>
          {(p) => <Input {...p} inputMode="numeric" value={f.last_batch_minutes} onChange={(e) => set('last_batch_minutes', e.target.value)} />}
        </Field>
        <Field label="Purga/desperdicio por tanda (g)" hint="Fijo por impresión, no por pieza" error={errors.waste_grams_per_batch}>
          {(p) => <Input {...p} inputMode="decimal" value={f.waste_grams_per_batch} onChange={(e) => set('waste_grams_per_batch', e.target.value)} />}
        </Field>
      </div>

      {preview && (
        <p className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-accent-fg" aria-live="polite">
          {formatInt(job.quantity)} productos → {formatInt(preview.pieces)} piezas → <strong>{formatInt(preview.batches)} impresiones</strong>
        </p>
      )}

      <Field label="Descripción (opcional)" error={errors.description}>
        {(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />}
      </Field>
      <Field label="Notas (opcional)" error={errors.notes}>
        {(p) => <Textarea {...p} rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}
      </Field>

      {submitError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{submitError}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={create.isPending || update.isPending}>
          {component ? 'Guardar cambios' : 'Añadir componente'}
        </Button>
      </div>
    </form>
  )
}
