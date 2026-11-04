import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Form'
import { useLogProduction } from '@/data/hooks'
import { checkCompleted, type ComponentPlan } from '@/domain/calc'
import type { JobComponent } from '@/domain/types'

interface Props {
  open: boolean
  onClose: () => void
  component: JobComponent
  plan: ComponentPlan
}

export function ProductionDialog({ open, onClose, component, plan }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={`Registrar producción · ${component.name}`}>
      {open && <ProductionForm component={component} plan={plan} onClose={onClose} />}
    </Dialog>
  )
}

function ProductionForm({ component, plan, onClose }: Omit<Props, 'open'>) {
  const log = useLogProduction()
  const [completed, setCompleted] = useState(String(component.completed_qty))
  const [failed, setFailed] = useState('0')
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nextCompleted = Number(completed)
  const addFailed = Number(failed)
  const validNumbers = completed.trim() !== '' && Number.isInteger(nextCompleted) && nextCompleted >= 0 && failed.trim() !== '' && Number.isInteger(addFailed) && addFailed >= 0
  const issue = validNumbers ? checkCompleted(nextCompleted, plan.piecesNeeded) : null
  const delta = nextCompleted - component.completed_qty

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!validNumbers) return setError('Introduce enteros mayores o iguales que 0')
    if (issue === 'exceeds_needed' && !ack) {
      setAck(true)
      return
    }
    if (delta === 0 && addFailed === 0) return onClose()
    setError(null)
    try {
      await log.mutateAsync({ componentId: component.id, completed: delta, failed: addFailed, note: note || 'Ajuste manual' })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label={`Piezas completadas (de ${plan.piecesNeeded})`} error={!validNumbers ? 'Introduce un entero ≥ 0' : undefined}>
        {(p) => <Input {...p} inputMode="numeric" autoFocus value={completed} onChange={(e) => { setCompleted(e.target.value); setAck(false) }} />}
      </Field>
      <Field label="Piezas fallidas a añadir" hint="Se siguen contando como pendientes: hay que volver a imprimirlas">
        {(p) => <Input {...p} inputMode="numeric" value={failed} onChange={(e) => setFailed(e.target.value)} />}
      </Field>
      <Field label="Nota (opcional)">{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      {issue === 'exceeds_needed' && (
        <p role="alert" className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          {nextCompleted} supera las {plan.piecesNeeded} piezas necesarias. {ack ? 'Pulsa de nuevo para guardar igualmente.' : ''}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={log.isPending}>
          {issue === 'exceeds_needed' && ack ? 'Guardar de todas formas' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}
