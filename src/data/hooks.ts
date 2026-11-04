import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { planJob, type JobPlan, type PricingContext } from '@/domain/calc'
import { DEFAULT_SETTINGS, type ComponentColor, type Job, type JobComponent, type Material, type Settings } from '@/domain/types'
import * as api from './api'

const KEY = {
  jobs: ['db', 'jobs'],
  components: ['db', 'components'],
  colors: ['db', 'colors'],
  materials: ['db', 'materials'],
  settings: ['db', 'settings'],
  log: (id: string) => ['db', 'log', id],
} as const

export const useJobs = () => useQuery({ queryKey: KEY.jobs, queryFn: api.fetchJobs })
export const useComponents = () => useQuery({ queryKey: KEY.components, queryFn: api.fetchComponents })
export const useColors = () => useQuery({ queryKey: KEY.colors, queryFn: api.fetchColors })
export const useMaterials = () => useQuery({ queryKey: KEY.materials, queryFn: api.fetchMaterials })
export const useSettings = () => useQuery({ queryKey: KEY.settings, queryFn: api.fetchSettings })
export const useProductionLog = (componentId: string, enabled: boolean) =>
  useQuery({ queryKey: KEY.log(componentId), queryFn: () => api.fetchLog(componentId), enabled })

export interface Workspace {
  jobs: Job[]
  components: JobComponent[]
  colors: ComponentColor[]
  materials: Material[]
  settings: Settings
  pricing: PricingContext
  plans: Map<string, JobPlan>
  componentsByJob: Map<string, JobComponent[]>
  colorsByComponent: Map<string, ComponentColor[]>
}

/** Carga todo el espacio de trabajo (volumen personal: unas decenas de trabajos) y calcula los planes en cliente. */
export function useWorkspace() {
  const jobs = useJobs()
  const components = useComponents()
  const colors = useColors()
  const materials = useMaterials()
  const settings = useSettings()
  const queries = [jobs, components, colors, materials, settings]
  const error = queries.find((q) => q.error)?.error ?? null
  const isLoading = queries.some((q) => q.isLoading)

  const workspace = useMemo<Workspace | null>(() => {
    if (!jobs.data || !components.data || !colors.data || !materials.data || !settings.data) return null
    const componentsByJob = new Map<string, JobComponent[]>()
    for (const c of components.data) componentsByJob.set(c.job_id, [...(componentsByJob.get(c.job_id) ?? []), c])
    const colorsByComponent = new Map<string, ComponentColor[]>()
    for (const k of colors.data) colorsByComponent.set(k.component_id, [...(colorsByComponent.get(k.component_id) ?? []), k])
    const pricing: PricingContext = { materials: new Map(materials.data.map((m) => [m.id, m])), settings: settings.data }
    const plans = new Map(jobs.data.map((j) => [j.id, planJob(j, componentsByJob.get(j.id) ?? [], colorsByComponent, pricing)]))
    return {
      jobs: jobs.data, components: components.data, colors: colors.data, materials: materials.data,
      settings: settings.data ?? DEFAULT_SETTINGS, pricing, plans, componentsByJob, colorsByComponent,
    }
  }, [jobs.data, components.data, colors.data, materials.data, settings.data])

  const refetch = () => queries.forEach((q) => void q.refetch())
  return { workspace, isLoading, error, refetch }
}

/** Mutación que invalida todo el caché de datos al terminar (el volumen es pequeño; evita estados inconsistentes). */
function useDbMutation<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['db'] }) })
}

export const useCreateJob = () => useDbMutation(api.createJob)
export const useUpdateJob = () => useDbMutation((v: { id: string; patch: Parameters<typeof api.updateJob>[1] }) => api.updateJob(v.id, v.patch))
export const useDeleteJob = () => useDbMutation(api.deleteJob)
export const useDuplicateJob = () => useDbMutation(api.duplicateJob)
export const useCreateComponent = () =>
  useDbMutation((v: { jobId: string; input: Parameters<typeof api.createComponent>[1]; position: number }) => api.createComponent(v.jobId, v.input, v.position))
export const useUpdateComponent = () =>
  useDbMutation((v: { id: string; input: Parameters<typeof api.updateComponent>[1] }) => api.updateComponent(v.id, v.input))
export const useDeleteComponent = () => useDbMutation(api.deleteComponent)
export const useLogProduction = () =>
  useDbMutation((v: { componentId: string; completed?: number; failed?: number; note?: string }) =>
    api.logProduction(v.componentId, v.completed ?? 0, v.failed ?? 0, v.note))
export const useSaveSettings = () => useDbMutation(api.saveSettings)
