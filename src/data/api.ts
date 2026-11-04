import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { ComponentInput, JobInput, SettingsInput } from '@/domain/schemas'
import type { ComponentColor, Job, JobComponent, Material, ProductionLogEntry, Settings } from '@/domain/types'

type Result = { data: unknown; error: PostgrestError | null }

async function run<T>(query: PromiseLike<Result>): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(friendlyError(error))
  return data as T
}

function friendlyError(e: PostgrestError): string {
  if (e.code === '42501') return 'No tienes permiso para esta operación'
  if (e.code === '23514') return 'Algún valor no cumple las restricciones permitidas'
  if (e.code === '23503') return 'Referencia a un registro que no existe'
  return e.message
}

// ---------- Lecturas ----------
export const fetchJobs = () => run<Job[]>(supabase.from('jobs').select('*').order('due_date'))
export const fetchComponents = () => run<JobComponent[]>(supabase.from('job_components').select('*').order('position').order('created_at'))
export const fetchColors = () => run<ComponentColor[]>(supabase.from('component_colors').select('*').order('created_at'))
export const fetchMaterials = () => run<Material[]>(supabase.from('materials').select('*').order('type').order('name'))
export const fetchLog = (componentId: string) =>
  run<ProductionLogEntry[]>(supabase.from('production_log').select('*').eq('component_id', componentId).order('created_at', { ascending: false }).limit(50))

export async function fetchSettings(): Promise<Settings> {
  const row = await run<Settings | null>(supabase.from('settings').select('*').maybeSingle())
  if (!row) throw new Error('Falta la fila de configuración: vuelve a ejecutar las migraciones')
  return { ...row, hours_per_day: Number(row.hours_per_day), printer_watts: Number(row.printer_watts), kwh_price: Number(row.kwh_price), default_price_per_kg: Number(row.default_price_per_kg) }
}

// ---------- Trabajos ----------
export const createJob = (input: JobInput) => run<Job>(supabase.from('jobs').insert(input).select().single())
export const updateJob = (id: string, patch: Partial<JobInput> | { archived_at: string | null }) =>
  run<Job>(supabase.from('jobs').update(patch).eq('id', id).select().single())
export const deleteJob = (id: string) => run<null>(supabase.from('jobs').delete().eq('id', id))
export const duplicateJob = (id: string) => run<string>(supabase.rpc('duplicate_job', { p_job_id: id }))

// ---------- Componentes ----------
export const createComponent = (jobId: string, input: ComponentInput, position: number) =>
  run<JobComponent>(supabase.from('job_components').insert({ ...input, job_id: jobId, position }).select().single())
export const updateComponent = (id: string, input: Partial<ComponentInput>) =>
  run<JobComponent>(supabase.from('job_components').update(input).eq('id', id).select().single())
export const deleteComponent = (id: string) => run<null>(supabase.from('job_components').delete().eq('id', id))

/** Registra producción: el trigger de la BD aplica los deltas a los contadores del componente. */
export const logProduction = (componentId: string, completedDelta: number, failedDelta: number, note = '') =>
  run<null>(supabase.from('production_log').insert({ component_id: componentId, completed_delta: completedDelta, failed_delta: failedDelta, note }))

// ---------- Configuración ----------
export const saveSettings = (input: SettingsInput) => run<Settings>(supabase.from('settings').update(input).eq('singleton', true).select().single())

// ---------- Acceso ----------
export async function checkOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_owner')
  if (error) throw new Error(error.message)
  return data === true
}
