import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { planJob, type JobPlan, type PricingContext } from '@/domain/calc'
import type { ModelFile } from '@/domain/files'
import { DEFAULT_SETTINGS, type ComponentColor, type Job, type JobComponent, type JobFile, type Material, type Settings } from '@/domain/types'
import * as api from './api'
import * as storage from './storage'

const KEY = {
  jobs: ['db', 'jobs'],
  components: ['db', 'components'],
  colors: ['db', 'colors'],
  materials: ['db', 'materials'],
  models: ['db', 'models'],
  jobFiles: ['db', 'jobFiles'],
  settings: ['db', 'settings'],
  log: (id: string) => ['db', 'log', id],
} as const

export const useJobs = () => useQuery({ queryKey: KEY.jobs, queryFn: api.fetchJobs })
export const useComponents = () => useQuery({ queryKey: KEY.components, queryFn: api.fetchComponents })
export const useColors = () => useQuery({ queryKey: KEY.colors, queryFn: api.fetchColors })
export const useMaterials = () => useQuery({ queryKey: KEY.materials, queryFn: api.fetchMaterials })
export const useModels = () => useQuery({ queryKey: KEY.models, queryFn: api.fetchModels })
export const useJobFiles = () => useQuery({ queryKey: KEY.jobFiles, queryFn: api.fetchJobFiles })
export const useSettings = () => useQuery({ queryKey: KEY.settings, queryFn: api.fetchSettings })
export const useProductionLog = (componentId: string, enabled: boolean) =>
  useQuery({ queryKey: KEY.log(componentId), queryFn: () => api.fetchLog(componentId), enabled })

export interface Workspace {
  jobs: Job[]
  components: JobComponent[]
  colors: ComponentColor[]
  materials: Material[]
  models: ModelFile[]
  modelsById: Map<string, ModelFile>
  jobFiles: JobFile[]
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
  const models = useModels()
  const jobFiles = useJobFiles()
  const queries = [jobs, components, colors, materials, settings, models, jobFiles]
  const error = queries.find((q) => q.error)?.error ?? null
  const isLoading = queries.some((q) => q.isLoading)

  const workspace = useMemo<Workspace | null>(() => {
    if (!jobs.data || !components.data || !colors.data || !materials.data || !settings.data || !models.data || !jobFiles.data) return null
    const componentsByJob = new Map<string, JobComponent[]>()
    for (const c of components.data) componentsByJob.set(c.job_id, [...(componentsByJob.get(c.job_id) ?? []), c])
    const colorsByComponent = new Map<string, ComponentColor[]>()
    for (const k of colors.data) colorsByComponent.set(k.component_id, [...(colorsByComponent.get(k.component_id) ?? []), k])
    const pricing: PricingContext = { materials: new Map(materials.data.map((m) => [m.id, m])), settings: settings.data }
    const plans = new Map(jobs.data.map((j) => [j.id, planJob(j, componentsByJob.get(j.id) ?? [], colorsByComponent, pricing)]))
    return {
      jobs: jobs.data, components: components.data, colors: colors.data, materials: materials.data,
      models: models.data, modelsById: new Map(models.data.map((m) => [m.id, m])), jobFiles: jobFiles.data,
      settings: settings.data ?? DEFAULT_SETTINGS, pricing, plans, componentsByJob, colorsByComponent,
    }
  }, [jobs.data, components.data, colors.data, materials.data, settings.data, models.data, jobFiles.data])

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
export const useSaveComponent = () => useDbMutation(api.saveComponent)
export const useDeleteComponent = () => useDbMutation(api.deleteComponent)
export const useLogProduction = () =>
  useDbMutation((v: { componentId: string; completed?: number; failed?: number; note?: string }) =>
    api.logProduction(v.componentId, v.completed ?? 0, v.failed ?? 0, v.note))
export const useSaveSettings = () => useDbMutation(api.saveSettings)

export const useCreateMaterial = () => useDbMutation(api.createMaterial)
export const useUpdateMaterial = () => useDbMutation((v: { id: string; input: Parameters<typeof api.updateMaterial>[1] }) => api.updateMaterial(v.id, v.input))
export const useDeleteMaterial = () => useDbMutation(api.deleteMaterial)

export const useUploadModel = () => useDbMutation(storage.uploadModel)
export const useReplaceModel = () => useDbMutation((v: { model: ModelFile; file: File }) => storage.replaceModelFile(v.model, v.file))
export const useSetThumbnail = () => useDbMutation((v: { model: ModelFile; image: File }) => storage.setModelThumbnail(v.model, v.image))
export const useRenameModel = () => useDbMutation((v: { id: string; name: string }) => storage.renameModel(v.id, v.name))
export const useDeleteModel = () => useDbMutation(storage.deleteModel)
export const useAttachFile = () => useDbMutation((v: { jobId: string; fileId: string }) => api.attachFile(v.jobId, v.fileId))
export const useDetachFile = () => useDbMutation((v: { jobId: string; fileId: string }) => api.detachFile(v.jobId, v.fileId))

/** Cambia la portada de un trabajo: sube la imagen, actualiza la fila y borra la anterior (con compensación si falla). */
export const useSetCover = () =>
  useDbMutation(async (v: { job: Job; image: File }) => {
    const path = await storage.uploadCover(v.image)
    try {
      await api.updateJob(v.job.id, { cover_path: path })
    } catch (e) {
      await storage.removeCover(path)
      throw e
    }
    await storage.removeCover(v.job.cover_path)
  })

/** URLs firmadas (1 h) para un conjunto de rutas; se renuevan antes de caducar. */
export function useSignedUrls(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))].sort()
  return useQuery({
    queryKey: ['storage', 'signed', unique],
    queryFn: () => storage.signedUrls(unique, 3600),
    enabled: unique.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    refetchInterval: 50 * 60_000,
  })
}
