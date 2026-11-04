import { FileBox, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/AppShell'
import { Thumb } from '@/components/Thumb'
import { Badge, Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Form'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { useSignedUrls, useWorkspace } from '@/data/hooks'
import { formatBytes, type ModelFile } from '@/domain/files'
import { formatDate } from '@/lib/format'
import { ModelDialog } from './ModelDialog'
import { DropZone, UploadButton, UploadMessages, useModelUploader } from './Upload'
import { jobsUsingModel } from './usage'

type Sort = 'recent' | 'name' | 'size'
const SORTERS: Record<Sort, (a: ModelFile, b: ModelFile) => number> = {
  recent: (a, b) => b.created_at.localeCompare(a.created_at),
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
  size: (a, b) => b.size_bytes - a.size_bytes,
}

export function LibraryPage() {
  const { workspace: ws, isLoading, error, refetch } = useWorkspace()
  const uploader = useModelUploader()
  const [query, setQuery] = useState('')
  const [format, setFormat] = useState<'' | '3mf' | 'stl'>('')
  const [sort, setSort] = useState<Sort>('recent')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const models = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (ws?.models ?? [])
      .filter((m) => !format || m.format === format)
      .filter((m) => !q || `${m.name} ${m.file_name}`.toLowerCase().includes(q))
      .sort(SORTERS[sort])
  }, [ws, query, format, sort])

  const urls = useSignedUrls(models.map((m) => m.thumbnail_path)).data ?? {}
  const selected = ws?.models.find((m) => m.id === selectedId)

  return (
    <>
      <PageHeader title="Biblioteca" subtitle="Tus modelos 3MF y STL, listos para reutilizar" actions={<UploadButton uploader={uploader} />} />
      <DropZone uploader={uploader}>
        <div className="flex flex-col gap-5 px-4 md:px-8">
          <UploadMessages outcome={uploader.outcome} />
          <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <Input aria-label="Buscar modelos" placeholder="Buscar por nombre" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2.5 md:flex">
              <Select aria-label="Formato" value={format} onChange={(e) => setFormat(e.target.value as '' | '3mf' | 'stl')}>
                <option value="">Formato: todos</option>
                <option value="3mf">3MF</option>
                <option value="stl">STL</option>
              </Select>
              <Select aria-label="Ordenar modelos" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Más recientes</option>
                <option value="name">Por nombre</option>
                <option value="size">Por tamaño</option>
              </Select>
            </div>
          </div>

          {isLoading && <Loading />}
          {error && <ErrorState error={error} onRetry={refetch} />}
          {ws && ws.models.length === 0 && (
            <EmptyState
              icon={<FileBox className="size-8" />}
              title="Tu biblioteca está vacía"
              text="Sube archivos .3mf o .stl (hasta 50 MB cada uno) o arrástralos aquí. Se guardan íntegros en un almacenamiento privado."
              action={<UploadButton uploader={uploader} label="Subir el primero" />}
            />
          )}
          {ws && ws.models.length > 0 && models.length === 0 && <EmptyState icon={<SearchX className="size-8" />} title="Ningún modelo coincide" />}
          {ws && models.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {models.map((m) => {
                const used = jobsUsingModel(ws, m.id).length
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => setSelectedId(m.id)} className="group block w-full cursor-pointer rounded-card text-left" aria-label={`Abrir ${m.name}`}>
                      <Card className="overflow-hidden transition-colors group-hover:border-line-strong group-hover:bg-raised">
                        <Thumb url={m.thumbnail_path ? urls[m.thumbnail_path] : null} label={`Miniatura de ${m.name}`} className="aspect-square w-full rounded-none border-0 border-b" />
                        <div className="flex flex-col gap-1.5 p-3">
                          <span className="truncate text-sm font-medium">{m.name}</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={m.format === '3mf' ? 'accent' : 'info'}>{m.format.toUpperCase()}</Badge>
                            <span className="text-xs text-faint">{formatBytes(m.size_bytes)}</span>
                          </div>
                          <span className="text-xs text-faint">{used > 0 ? `${used} ${used === 1 ? 'trabajo' : 'trabajos'}` : 'Sin usar'} · {formatDate(m.created_at)}</span>
                        </div>
                      </Card>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DropZone>
      {ws && selected && <ModelDialog open model={selected} ws={ws} onClose={() => setSelectedId(null)} />}
    </>
  )
}
