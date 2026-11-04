import { useSignedUrls, type Workspace } from '@/data/hooks'
import type { Job } from '@/domain/types'

/** Ruta de la imagen representativa de un trabajo: su portada, o la miniatura del primer modelo asociado a un componente. */
export function jobThumbPath(ws: Pick<Workspace, 'componentsByJob' | 'modelsById'>, job: Job): string | null {
  if (job.cover_path) return job.cover_path
  for (const c of ws.componentsByJob.get(job.id) ?? []) {
    const path = c.file_id ? ws.modelsById.get(c.file_id)?.thumbnail_path : null
    if (path) return path
  }
  return null
}

/** URLs firmadas (en lote) de las miniaturas de una lista de trabajos: jobId → url. */
export function useJobThumbs(ws: Workspace | null, jobs: Job[]): Map<string, string> {
  const paths = ws ? jobs.map((j) => [j.id, jobThumbPath(ws, j)] as const) : []
  const urls = useSignedUrls(paths.map(([, p]) => p)).data ?? {}
  const out = new Map<string, string>()
  for (const [id, p] of paths) if (p && urls[p]) out.set(id, urls[p])
  return out
}
