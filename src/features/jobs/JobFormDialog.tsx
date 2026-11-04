import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Segmented, Select, Switch, Textarea } from '@/components/ui/Form'
import { useCreateJob, useUpdateJob } from '@/data/hooks'
import { addDaysISO, todayISO } from '@/domain/dates'
import { fieldErrors, jobSchema } from '@/domain/schemas'
import type { Job, JobKind, JobStatus, Priority } from '@/domain/types'
import { KIND_LABEL, priorityOptions, statusOptions } from './meta'

interface Props {
  open: boolean
  onClose: () => void
  /** Si se pasa, el formulario edita ese trabajo; si no, crea uno nuevo. */
  job?: Job
}

interface FormState {
  name: string
  description: string
  kind: JobKind
  is_mandatory: boolean
  client_name: string
  quantity: string
  priority: Priority
  status: JobStatus
  due_date: string
  estimated_finish_date: string
  notes: string
  sale_price: string
  extra_costs: string
}

const blank = (): FormState => ({
  name: '', description: '', kind: 'commission', is_mandatory: false, client_name: '', quantity: '1', priority: 'normal',
  status: 'pending', due_date: addDaysISO(todayISO(), 14), estimated_finish_date: '', notes: '', sale_price: '', extra_costs: '0',
})

const fromJob = (j: Job): FormState => ({
  name: j.name, description: j.description, kind: j.kind, is_mandatory: j.is_mandatory, client_name: j.client_name ?? '',
  quantity: String(j.quantity), priority: j.priority, status: j.status, due_date: j.due_date,
  estimated_finish_date: j.estimated_finish_date ?? '', notes: j.notes, sale_price: j.sale_price == null ? '' : String(j.sale_price),
  extra_costs: String(j.extra_costs),
})

const toNumber = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

export function JobFormDialog({ open, onClose, job }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={job ? 'Editar trabajo' : 'Nuevo trabajo'} wide>
      {open && <JobForm key={job?.id ?? 'new'} job={job} onClose={onClose} />}
    </Dialog>
  )
}

function JobForm({ job, onClose }: { job?: Job; onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreateJob()
  const update = useUpdateJob()
  const [f, setF] = useState<FormState>(() => (job ? fromJob(job) : blank()))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const busy = create.isPending || update.isPending
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const parsed = jobSchema.safeParse({
      name: f.name,
      description: f.description,
      kind: f.kind,
      is_mandatory: f.is_mandatory,
      client_name: f.kind === 'commission' && f.client_name.trim() ? f.client_name : null,
      quantity: toNumber(f.quantity),
      priority: f.priority,
      status: f.status,
      due_date: f.due_date,
      estimated_finish_date: f.estimated_finish_date || null,
      notes: f.notes,
      sale_price: f.sale_price.trim() === '' ? null : toNumber(f.sale_price),
      extra_costs: toNumber(f.extra_costs),
    })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    try {
      if (job) await update.mutateAsync({ id: job.id, patch: parsed.data })
      else {
        const created = await create.mutateAsync(parsed.data)
        navigate(`/jobs/${created.id}`)
      }
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const err = (k: string) => errors[k]
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Nombre" error={err('name')}>
        {(p) => <Input {...p} autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. 33 figuras personalizadas" />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          {() => (
            <Segmented label="Tipo" value={f.kind} onChange={(v) => set('kind', v)} options={(['commission', 'personal'] as const).map((v) => ({ value: v, label: KIND_LABEL[v] }))} />
          )}
        </Field>
        <Field label="Cantidad de productos finales" error={err('quantity')}>
          {(p) => <Input {...p} inputMode="numeric" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} />}
        </Field>
        <Field label="Fecha límite de entrega" error={err('due_date')}>
          {(p) => <Input {...p} type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} />}
        </Field>
        <Field label="Prioridad">
          {(p) => (
            <Select {...p} value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {priorityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      <Switch checked={f.is_mandatory} onChange={(v) => set('is_mandatory', v)} label="Compromiso obligatorio (independiente de la prioridad)" />

      {f.kind === 'commission' && (
        <Field label="Cliente (opcional)" error={err('client_name')}>
          {(p) => <Input {...p} value={f.client_name} onChange={(e) => set('client_name', e.target.value)} />}
        </Field>
      )}

      <details open={!!job} className="group rounded-lg border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm text-muted select-none group-open:mb-4">Más detalles</summary>
        <div className="flex flex-col gap-4">
          {job && (
            <Field label="Estado">
              {(p) => (
                <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value as JobStatus)}>
                  {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Field label="Fecha estimada de finalización" hint="Opcional. Se avisa si supera la fecha límite." error={err('estimated_finish_date')}>
            {(p) => <Input {...p} type="date" value={f.estimated_finish_date} onChange={(e) => set('estimated_finish_date', e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Precio de venta (opcional)" error={err('sale_price')}>
              {(p) => <Input {...p} inputMode="decimal" value={f.sale_price} onChange={(e) => set('sale_price', e.target.value)} />}
            </Field>
            <Field label="Costes adicionales" hint="Embalaje, envío, consumibles…" error={err('extra_costs')}>
              {(p) => <Input {...p} inputMode="decimal" value={f.extra_costs} onChange={(e) => set('extra_costs', e.target.value)} />}
            </Field>
          </div>
          <Field label="Descripción" error={err('description')}>
            {(p) => <Textarea {...p} value={f.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>
          <Field label="Notas" error={err('notes')}>
            {(p) => <Textarea {...p} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
        </div>
      </details>

      {submitError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{submitError}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={busy}>{job ? 'Guardar cambios' : 'Crear trabajo'}</Button>
      </div>
    </form>
  )
}
