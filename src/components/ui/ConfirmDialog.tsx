import { useState } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<unknown> | void
  onClose: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </Dialog>
  )
}
