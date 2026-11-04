import { Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { useUploadModel } from '@/data/hooks'
import type { ModelFile } from '@/domain/files'
import { cn } from '@/lib/cn'

export interface UploadOutcome {
  models: ModelFile[]
  messages: { tone: 'error' | 'warn'; text: string }[]
}

/** Sube varios archivos de uno en uno (sin bloquear la interfaz) y recoge errores por archivo. */
export function useModelUploader(onDone?: (o: UploadOutcome) => void) {
  const mutation = useUploadModel()
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null)

  async function upload(files: File[]) {
    const out: UploadOutcome = { models: [], messages: [] }
    for (const [i, file] of files.entries()) {
      setProgress({ current: i + 1, total: files.length })
      try {
        const r = await mutation.mutateAsync(file)
        out.models.push(r.model)
        for (const w of r.warnings) out.messages.push({ tone: 'warn', text: `${file.name}: ${w}` })
      } catch (e) {
        out.messages.push({ tone: 'error', text: e instanceof Error ? e.message : `No se pudo subir «${file.name}»` })
      }
    }
    setProgress(null)
    setOutcome(out)
    onDone?.(out)
    return out
  }
  return { upload, progress, outcome, busy: progress != null, clear: () => setOutcome(null) }
}

export function UploadMessages({ outcome }: { outcome: UploadOutcome | null }) {
  if (!outcome || outcome.messages.length === 0) return null
  return (
    <ul className="flex flex-col gap-1.5" role="alert">
      {outcome.messages.map((m, i) => (
        <li key={i} className={cn('rounded-lg border px-3 py-2 text-sm', m.tone === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warn/30 bg-warn/10 text-warn')}>
          {m.text}
        </li>
      ))}
    </ul>
  )
}

const ACCEPT = '.3mf,.stl'

export function UploadButton({ uploader, label = 'Subir modelo', variant = 'primary' }: { uploader: ReturnType<typeof useModelUploader>; label?: string; variant?: 'primary' | 'secondary' }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        aria-label="Seleccionar archivos 3MF o STL"
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) void uploader.upload(files)
        }}
      />
      <Button variant={variant} loading={uploader.busy} onClick={() => input.current?.click()}>
        <Upload className="size-4" aria-hidden />
        {uploader.progress ? `Subiendo ${uploader.progress.current}/${uploader.progress.total}…` : label}
      </Button>
    </>
  )
}

/** Zona de arrastrar y soltar para la biblioteca. */
export function DropZone({ uploader, children }: { uploader: ReturnType<typeof useModelUploader>; children: React.ReactNode }) {
  const [over, setOver] = useState(false)
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const files = [...e.dataTransfer.files]
    if (files.length) void uploader.upload(files)
  }
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn('rounded-card transition-colors', over && 'outline-2 -outline-offset-2 outline-dashed outline-accent')}
    >
      {children}
    </div>
  )
}
