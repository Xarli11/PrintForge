import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Swatch } from '@/components/Swatch'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { ErrorState, Loading } from '@/components/ui/States'
import { useColors, useCreateMaterial, useDeleteMaterial, useMaterials, useUpdateMaterial } from '@/data/hooks'
import { fieldErrors, materialSchema } from '@/domain/schemas'
import type { Material } from '@/domain/types'
import { formatMoney } from '@/lib/format'

const TYPES = ['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Silk PLA', 'Otro']

export function MaterialsCard({ currency }: { currency: string }) {
  const { data: materials, isLoading, error, refetch } = useMaterials()
  const colors = useColors().data ?? []
  const del = useDeleteMaterial()
  const [editing, setEditing] = useState<Material | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Material | null>(null)

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Materiales</h2>
          <p className="mt-1 text-sm text-muted">Catálogo de filamentos con su color y precio por kg, para calcular el coste de cada color.</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />Material
        </Button>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {materials && materials.length === 0 && <p className="text-sm text-muted">Aún no hay materiales. Los componentes sin material se valoran con el precio por defecto.</p>}
      {materials && materials.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {materials.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <Swatch hex={m.color_hex} className="size-5" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted">{[m.type, m.brand].filter(Boolean).join(' · ')} · {formatMoney(m.price_per_kg, currency)}/kg</p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Editar ${m.name}`} onClick={() => setEditing(m)}><Pencil className="size-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={`Eliminar ${m.name}`} onClick={() => setDeleting(m)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo material' : 'Editar material'}>
        {editing != null && <MaterialForm key={editing === 'new' ? 'new' : editing.id} material={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        danger
        title="Eliminar material"
        message={`Se eliminará «${deleting?.name}». ${colors.filter((c) => c.material_id === deleting?.id).length} colores de componentes que lo usan quedarán «sin material asignado» y se valorarán al precio por defecto.`}
        confirmLabel="Eliminar"
        onConfirm={() => del.mutateAsync(deleting!.id)}
      />
    </Card>
  )
}

function MaterialForm({ material, onClose }: { material?: Material; onClose: () => void }) {
  const create = useCreateMaterial()
  const update = useUpdateMaterial()
  const [f, setF] = useState({
    type: material?.type ?? 'PLA',
    brand: material?.brand ?? '',
    name: material?.name ?? '',
    color_hex: material?.color_hex ?? '#10b981',
    price_per_kg: String(material?.price_per_kg ?? 20),
    notes: material?.notes ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const parsed = materialSchema.safeParse({ ...f, price_per_kg: f.price_per_kg.trim() === '' ? NaN : Number(f.price_per_kg.replace(',', '.')) })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    try {
      if (material) await update.mutateAsync({ id: material.id, input: parsed.data })
      else await create.mutateAsync(parsed.data)
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const validHex = /^#[0-9a-fA-F]{6}$/.test(f.color_hex)
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" error={errors.type}>
          {(p) => (
            <>
              <Input {...p} list="material-types" value={f.type} onChange={(e) => set('type', e.target.value)} />
              <datalist id="material-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Marca (opcional)" error={errors.brand}>{(p) => <Input {...p} value={f.brand} onChange={(e) => set('brand', e.target.value)} />}</Field>
      </div>
      <Field label="Nombre" error={errors.name}>
        {(p) => <Input {...p} autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Verde esmeralda" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Color" error={errors.color_hex}>
          {(p) => (
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Selector de color"
                value={validHex ? f.color_hex : '#888888'}
                onChange={(e) => set('color_hex', e.target.value)}
                className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1 md:h-10"
              />
              <Input {...p} value={f.color_hex} onChange={(e) => set('color_hex', e.target.value)} className="font-mono" maxLength={7} />
            </div>
          )}
        </Field>
        <Field label="Precio por kg" error={errors.price_per_kg}>
          {(p) => <Input {...p} inputMode="decimal" value={f.price_per_kg} onChange={(e) => set('price_per_kg', e.target.value)} />}
        </Field>
      </div>
      <Field label="Notas (opcional)" error={errors.notes}>{(p) => <Textarea {...p} rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
      {submitError && <p role="alert" className="text-sm text-danger">{submitError}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={create.isPending || update.isPending}>{material ? 'Guardar' : 'Añadir material'}</Button>
      </div>
    </form>
  )
}
