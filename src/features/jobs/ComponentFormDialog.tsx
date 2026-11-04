import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Swatch } from '@/components/Swatch'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { useMaterials, useModels, useSaveComponent } from '@/data/hooks'
import { batchesFor, piecesNeeded } from '@/domain/calc'
import { componentSchema, colorRowSchema, fieldErrors } from '@/domain/schemas'
import type { ComponentColor, Job, JobComponent } from '@/domain/types'
import { formatGrams, formatInt, formatMinutes } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
  job: Job
  /** Si se pasa, edita ese componente; si no, crea uno nuevo al final de la lista. */
  component?: JobComponent
  colors?: readonly ComponentColor[]
  nextPosition: number
}

interface ColorDraft {
  key: string
  material_id: string // '' = sin material asignado
  grams: string
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
  file_id: string
}

const toNumber = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

export function ComponentFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.component ? 'Editar componente' : 'Nuevo componente'} wide>
      {props.open && <ComponentForm key={props.component?.id ?? 'new'} {...props} />}
    </Dialog>
  )
}

function ComponentForm({ onClose, job, component, colors = [], nextPosition }: Props) {
  const save = useSaveComponent()
  const materials = useMaterials().data ?? []
  const models = useModels().data ?? []
  const [f, setF] = useState<FormState>(() => ({
    name: component?.name ?? '',
    description: component?.description ?? '',
    qty_per_unit: String(component?.qty_per_unit ?? 1),
    batch_capacity: String(component?.batch_capacity ?? 1),
    batch_minutes: String(component?.batch_minutes ?? ''),
    last_batch_minutes: component?.last_batch_minutes == null ? '' : String(component.last_batch_minutes),
    waste_grams_per_batch: String(component?.waste_grams_per_batch ?? 0),
    notes: component?.notes ?? '',
    file_id: component?.file_id ?? '',
  }))
  const [rows, setRows] = useState<ColorDraft[]>(() =>
    colors.map((c) => ({ key: c.id, material_id: c.material_id ?? '', grams: String(c.grams_per_batch) })),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const set = (k: keyof FormState, v: string) => setF((s) => ({ ...s, [k]: v }))
  const setRow = (key: string, patch: Partial<ColorDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  // Vista previa en vivo de lo que implican las cifras introducidas.
  const perUnit = toNumber(f.qty_per_unit)
  const capacity = toNumber(f.batch_capacity)
  const preview =
    Number.isInteger(perUnit) && perUnit >= 1 && Number.isInteger(capacity) && capacity >= 1
      ? { pieces: piecesNeeded(job.quantity, perUnit), batches: batchesFor(piecesNeeded(job.quantity, perUnit), capacity) }
      : null
  const gramsPerBatch = rows.reduce((s, r) => s + (Number.isFinite(toNumber(r.grams)) ? toNumber(r.grams) : 0), 0)

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
      file_id: f.file_id || null,
    })
    const parsedColors = rows.map((r) => colorRowSchema.safeParse({ material_id: r.material_id || null, grams_per_batch: r.grams.trim() === '' ? 0 : toNumber(r.grams) }))
    const colorError = parsedColors.find((r) => !r.success)
    if (!parsed.success || colorError) {
      const errs = parsed.success ? {} : fieldErrors(parsed.error)
      if (colorError && !colorError.success) errs.colors = colorError.error.issues[0]?.message ?? 'Revisa los colores'
      return setErrors(errs)
    }
    setErrors({})
    try {
      await save.mutateAsync({
        jobId: job.id,
        id: component?.id ?? null,
        input: parsed.data,
        position: component?.position ?? nextPosition,
        colors: parsedColors.flatMap((r) => (r.success ? [r.data] : [])),
      })
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
      </div>

      {preview && (
        <p className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-accent-fg" aria-live="polite">
          {formatInt(job.quantity)} productos → {formatInt(preview.pieces)} piezas → <strong>{formatInt(preview.batches)} impresiones</strong>
        </p>
      )}

      <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <legend className="px-1 text-xs font-medium text-muted">Colores y consumo de filamento</legend>
        <p className="text-xs text-faint">Gramos que consume cada color en una tanda completa. El total del componente es la suma de las filas.</p>
        {rows.map((r) => {
          const mat = materials.find((m) => m.id === r.material_id)
          return (
            <div key={r.key} className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2">
              <Field label="Material">
                {(p) => (
                  <div className="relative">
                    <Select {...p} className={mat ? 'pl-8' : undefined} value={r.material_id} onChange={(e) => setRow(r.key, { material_id: e.target.value })}>
                      <option value="">Sin material asignado</option>
                      {materials.map((m) => <option key={m.id} value={m.id}>{[m.type, m.brand, m.name].filter(Boolean).join(' · ')}</option>)}
                    </Select>
                    {mat && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"><Swatch hex={mat.color_hex} /></span>}
                  </div>
                )}
              </Field>
              <Field label="g / tanda">
                {(p) => <Input {...p} inputMode="decimal" value={r.grams} onChange={(e) => setRow(r.key, { grams: e.target.value })} />}
              </Field>
              <Button variant="ghost" size="icon" aria-label="Quitar color" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        })}
        {errors.colors && <p role="alert" className="text-xs text-danger">{errors.colors}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" onClick={() => setRows((rs) => [...rs, { key: crypto.randomUUID(), material_id: '', grams: '' }])}>
            <Plus className="size-4" aria-hidden />Añadir color
          </Button>
          {rows.length > 0 && <span className="text-xs text-muted">Total: {formatGrams(gramsPerBatch)} por tanda</span>}
        </div>
        {materials.length === 0 && <p className="text-xs text-faint">Aún no tienes materiales: créalos en Ajustes → Materiales para valorar el coste por marca y precio.</p>}
        <Field label="Purga/desperdicio por tanda (g)" hint="Fijo por impresión, no por pieza" error={errors.waste_grams_per_batch}>
          {(p) => <Input {...p} inputMode="decimal" value={f.waste_grams_per_batch} onChange={(e) => set('waste_grams_per_batch', e.target.value)} />}
        </Field>
      </fieldset>

      <Field label="Archivo del modelo (opcional)" hint={models.length === 0 ? 'Sube modelos en la Biblioteca para asociarlos aquí' : undefined}>
        {(p) => (
          <Select {...p} value={f.file_id} onChange={(e) => set('file_id', e.target.value)}>
            <option value="">Sin archivo</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.format.toUpperCase()})</option>)}
          </Select>
        )}
      </Field>

      <Field label="Descripción (opcional)" error={errors.description}>
        {(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />}
      </Field>
      <Field label="Notas (opcional)" error={errors.notes}>
        {(p) => <Textarea {...p} rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}
      </Field>

      {submitError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{submitError}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {component ? 'Guardar cambios' : 'Añadir componente'}
        </Button>
      </div>
    </form>
  )
}
