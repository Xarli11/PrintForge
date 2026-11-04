import { Download, FileBox, Library, Unlink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Thumb } from '@/components/Thumb'
import { Badge, Card, SectionTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Form'
import { useAttachFile, useDetachFile, useSignedUrls, type Workspace } from '@/data/hooks'
import { downloadModel } from '@/data/storage'
import { formatBytes, type ModelFile } from '@/domain/files'
import type { Job } from '@/domain/types'
import { UploadButton, UploadMessages, useModelUploader } from '../library/Upload'

export function JobFilesSection({ job, ws }: { job: Job; ws: Workspace }) {
  const attach = useAttachFile()
  const detach = useDetachFile()
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uploader = useModelUploader(async (o) => {
    for (const m of o.models) await attach.mutateAsync({ jobId: job.id, fileId: m.id }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo adjuntar'))
  })

  const attachedIds = new Set(ws.jobFiles.filter((f) => f.job_id === job.id).map((f) => f.file_id))
  const viaComponent = new Map<string, string[]>() // fileId → nombres de componentes
  for (const c of ws.componentsByJob.get(job.id) ?? []) {
    if (c.file_id) viaComponent.set(c.file_id, [...(viaComponent.get(c.file_id) ?? []), c.name])
  }
  const ids = [...new Set([...attachedIds, ...viaComponent.keys()])]
  const models = ids.map((id) => ws.modelsById.get(id)).filter((m): m is ModelFile => !!m)
  const urls = useSignedUrls(models.map((m) => m.thumbnail_path)).data ?? {}

  async function guarded(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La operación ha fallado')
    }
  }

  return (
    <section>
      <SectionTitle
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPicking(true)}><Library className="size-4" aria-hidden />De la biblioteca</Button>
            <UploadButton uploader={uploader} label="Subir" variant="secondary" />
          </div>
        }
      >
        Archivos
      </SectionTitle>
      <div className="mb-3"><UploadMessages outcome={uploader.outcome} /></div>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {models.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
          Sin archivos. Adjunta modelos de la biblioteca o sube nuevos; también puedes asociar uno a cada componente.
        </p>
      ) : (
        <Card className="divide-y divide-line">
          {models.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3">
              <Thumb url={m.thumbnail_path ? urls[m.thumbnail_path] : null} label={`Miniatura de ${m.name}`} className="size-12" />
              <div className="min-w-0 flex-1">
                <Link to="/library" className="block truncate text-sm font-medium hover:underline">{m.name}</Link>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge tone={m.format === '3mf' ? 'accent' : 'info'}>{m.format.toUpperCase()}</Badge>
                  {formatBytes(m.size_bytes)}
                  {viaComponent.has(m.id) && <span>· componente {viaComponent.get(m.id)!.join(', ')}</span>}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Descargar ${m.file_name}`} onClick={() => void guarded(() => downloadModel(m))}>
                <Download className="size-4" />
              </Button>
              {attachedIds.has(m.id) && (
                <Button variant="ghost" size="icon" aria-label={`Quitar ${m.name} del trabajo`} onClick={() => void guarded(() => detach.mutateAsync({ jobId: job.id, fileId: m.id }))}>
                  <Unlink className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}

      <Dialog open={picking} onClose={() => setPicking(false)} title="Adjuntar desde la biblioteca">
        {picking && <Picker ws={ws} exclude={attachedIds} onPick={async (m) => { await guarded(() => attach.mutateAsync({ jobId: job.id, fileId: m.id })); setPicking(false) }} />}
      </Dialog>
    </section>
  )
}

function Picker({ ws, exclude, onPick }: { ws: Workspace; exclude: Set<string>; onPick: (m: ModelFile) => void }) {
  const [q, setQ] = useState('')
  const list = ws.models.filter((m) => !exclude.has(m.id) && m.name.toLowerCase().includes(q.trim().toLowerCase()))
  const urls = useSignedUrls(list.map((m) => m.thumbnail_path)).data ?? {}
  return (
    <div className="flex flex-col gap-3">
      <Input aria-label="Buscar en la biblioteca" placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{ws.models.length === 0 ? 'La biblioteca está vacía.' : 'No hay más modelos que adjuntar.'}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onPick(m)} className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-line p-2 text-left hover:bg-raised">
                <Thumb url={m.thumbnail_path ? urls[m.thumbnail_path] : null} label="" className="size-10" />
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                <FileBox className="size-4 text-faint" aria-hidden />
                <Badge>{m.format.toUpperCase()}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
