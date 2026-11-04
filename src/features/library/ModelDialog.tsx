import { Download, ImagePlus, Pencil, Replace, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Thumb } from '@/components/Thumb'
import { Badge } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Form'
import { useDeleteModel, useRenameModel, useReplaceModel, useSetThumbnail, useSignedUrls, type Workspace } from '@/data/hooks'
import { downloadModel } from '@/data/storage'
import { formatBytes, type ModelFile } from '@/domain/files'
import { formatDate } from '@/lib/format'
import { StatusBadge } from '../jobs/meta'
import { jobsUsingModel } from './usage'

interface Props {
  open: boolean
  model: ModelFile
  ws: Workspace
  onClose: () => void
}

export function ModelDialog({ open, model, ws, onClose }: Props) {
  const rename = useRenameModel()
  const replace = useReplaceModel()
  const setThumb = useSetThumbnail()
  const del = useDeleteModel()
  const [name, setName] = useState(model.name)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const urls = useSignedUrls([model.thumbnail_path]).data ?? {}
  const used = jobsUsingModel(ws, model.id)

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setMessage(null)
    try {
      await fn()
      if (ok) setMessage({ tone: 'ok', text: ok })
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'La operación ha fallado' })
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modelo" wide>
      <div className="flex flex-col gap-5">
        <div className="flex gap-4">
          <Thumb url={model.thumbnail_path ? urls[model.thumbnail_path] : null} label={`Miniatura de ${model.name}`} className="size-28 md:size-36" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim() && name.trim() !== model.name) void run(() => rename.mutateAsync({ id: model.id, name }), 'Nombre actualizado')
              }}
            >
              <Input aria-label="Nombre del modelo" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" size="icon" aria-label="Guardar nombre" disabled={!name.trim() || name.trim() === model.name}>
                <Pencil className="size-4" />
              </Button>
            </form>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Badge tone={model.format === '3mf' ? 'accent' : 'info'}>{model.format.toUpperCase()}</Badge>
              {formatBytes(model.size_bytes)} · {formatDate(model.created_at)}
            </div>
            <p className="truncate text-xs text-faint" title={model.file_name}>Original: {model.file_name}</p>
            {model.thumbnail_source && (
              <p className="text-xs text-faint">Miniatura {model.thumbnail_source === 'imported' ? 'extraída del archivo 3MF' : 'subida manualmente'}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void run(() => downloadModel(model))}>
            <Download className="size-4" aria-hidden />Descargar original
          </Button>
          <input ref={fileInput} type="file" accept=".3mf,.stl" className="sr-only" tabIndex={-1} aria-label="Seleccionar archivo de reemplazo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void run(async () => {
                const r = await replace.mutateAsync({ model, file })
                if (r.orphans.length) throw new Error('Archivo cambiado, pero el anterior no se pudo borrar del almacenamiento (queda huérfano, sin coste de datos).')
              }, 'Archivo reemplazado')
            }} />
          <Button loading={replace.isPending} onClick={() => fileInput.current?.click()}>
            <Replace className="size-4" aria-hidden />Cambiar archivo
          </Button>
          <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Seleccionar imagen de miniatura"
            onChange={(e) => {
              const image = e.target.files?.[0]
              e.target.value = ''
              if (image) void run(() => setThumb.mutateAsync({ model, image }), 'Miniatura actualizada')
            }} />
          <Button loading={setThumb.isPending} onClick={() => imageInput.current?.click()}>
            <ImagePlus className="size-4" aria-hidden />Imagen
          </Button>
          <Button variant="danger" className="ml-auto" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" aria-hidden />Eliminar
          </Button>
        </div>
        {message && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-accent-fg'}>
            {message.text}
          </p>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Usado en</h3>
          {used.length === 0 ? (
            <p className="text-sm text-muted">Aún no se ha usado en ningún trabajo.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {used.map((j) => (
                <li key={j.id}>
                  <Link to={`/jobs/${j.id}`} onClick={onClose} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:bg-raised">
                    <span className="truncate">{j.name}</span>
                    <StatusBadge status={j.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        danger
        title="Eliminar modelo"
        message={
          used.length > 0
            ? `«${model.name}» se usa en ${used.length} ${used.length === 1 ? 'trabajo' : 'trabajos'}. Se eliminará el archivo original; los componentes se conservan sin archivo. No se puede deshacer.`
            : `Se eliminará «${model.name}» y su archivo original. No se puede deshacer.`
        }
        confirmLabel="Eliminar archivo"
        onConfirm={async () => {
          const orphans = await del.mutateAsync(model)
          if (orphans.length) console.warn('Objetos huérfanos en Storage:', orphans)
          onClose()
        }}
      />
    </Dialog>
  )
}
