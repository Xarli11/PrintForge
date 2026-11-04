import type { Workspace } from '@/data/hooks'
import type { Job } from '@/domain/types'

/** Trabajos que usan un modelo: por componente o como archivo adjunto. Sin duplicados, en el orden del espacio de trabajo. */
export function jobsUsingModel(ws: Pick<Workspace, 'jobs' | 'components' | 'jobFiles'>, fileId: string): Job[] {
  const ids = new Set<string>()
  for (const c of ws.components) if (c.file_id === fileId) ids.add(c.job_id)
  for (const jf of ws.jobFiles) if (jf.file_id === fileId) ids.add(jf.job_id)
  return ws.jobs.filter((j) => ids.has(j.id))
}
