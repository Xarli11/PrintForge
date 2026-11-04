import { Plus, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Form'
import { EmptyState, ErrorState, Loading } from '@/components/ui/States'
import { useWorkspace } from '@/data/hooks'
import { todayISO } from '@/domain/dates'
import type { Job, JobKind, JobStatus, Priority } from '@/domain/types'
import { JobCard } from './JobCard'
import { JobFormDialog } from './JobFormDialog'
import { useJobThumbs } from './thumbs'
import { KIND_LABEL, priorityOptions, statusOptions } from './meta'

type Sort = 'due' | 'recent' | 'name'
const SORTERS: Record<Sort, (a: Job, b: Job) => number> = {
  due: (a, b) => a.due_date.localeCompare(b.due_date),
  recent: (a, b) => b.updated_at.localeCompare(a.updated_at),
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
}

export function JobsPage() {
  const { workspace: ws, isLoading, error, refetch } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<JobStatus | 'active' | 'all'>('active')
  const [kind, setKind] = useState<JobKind | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [mandatory, setMandatory] = useState<'' | 'yes' | 'no'>('')
  const [sort, setSort] = useState<Sort>('due')
  const [showArchived, setShowArchived] = useState(false)
  const today = useMemo(() => todayISO(), [])

  const jobs = useMemo(() => {
    if (!ws) return []
    const q = query.trim().toLowerCase()
    return ws.jobs
      .filter((j) => (showArchived ? !!j.archived_at : !j.archived_at))
      .filter((j) => {
        if (status === 'all') return true
        if (status === 'active') return showArchived || !['done', 'delivered', 'cancelled'].includes(j.status)
        return j.status === status
      })
      .filter((j) => !kind || j.kind === kind)
      .filter((j) => !priority || j.priority === priority)
      .filter((j) => !mandatory || j.is_mandatory === (mandatory === 'yes'))
      .filter((j) => !q || `${j.name} ${j.client_name ?? ''}`.toLowerCase().includes(q))
      .sort(SORTERS[sort])
  }, [ws, query, status, kind, priority, mandatory, sort, showArchived])

  const thumbs = useJobThumbs(ws, jobs)

  return (
    <>
      <PageHeader
        title="Trabajos"
        subtitle={ws ? `${jobs.length} ${showArchived ? 'archivados' : 'mostrados'}` : undefined}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Nuevo trabajo
          </Button>
        }
      />
      <div className="flex flex-col gap-5 px-4 md:px-8">
        <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center">
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <Input aria-label="Buscar trabajos" placeholder="Buscar por nombre o cliente" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:flex">
            <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">Activos</option>
              <option value="all">Todos los estados</option>
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as JobKind | '')}>
              <option value="">Todos los tipos</option>
              {(Object.keys(KIND_LABEL) as JobKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
            <Select aria-label="Prioridad" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
              <option value="">Toda prioridad</option>
              {priorityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select aria-label="Obligatoriedad" value={mandatory} onChange={(e) => setMandatory(e.target.value as '' | 'yes' | 'no')}>
              <option value="">Obligatorio: todos</option>
              <option value="yes">Sólo obligatorios</option>
              <option value="no">No obligatorios</option>
            </Select>
            <Select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="due">Por fecha límite</option>
              <option value="recent">Más recientes</option>
              <option value="name">Por nombre</option>
            </Select>
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="size-4 accent-emerald-500" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Archivados
          </label>
        </div>

        {isLoading && <Loading />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {ws && jobs.length === 0 && (
          ws.jobs.length === 0 ? (
            <EmptyState
              icon={<Plus className="size-8" />}
              title="Aún no tienes trabajos"
              text="Un trabajo agrupa lo que tienes que imprimir: cantidad, fecha de entrega y componentes."
              action={<Button variant="primary" onClick={() => setCreating(true)}>Crear el primero</Button>}
            />
          ) : (
            <EmptyState icon={<SearchX className="size-8" />} title="Ningún trabajo coincide con los filtros" />
          )
        )}
        {ws && jobs.length > 0 && (
          <div className="grid gap-3 xl:grid-cols-2">
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} plan={ws.plans.get(j.id)!} today={today} hoursPerDay={ws.settings.hours_per_day} thumbUrl={thumbs.get(j.id)} />
            ))}
          </div>
        )}
      </div>
      <JobFormDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
