// Tipos que reflejan las tablas de PostgreSQL (snake_case) para evitar una capa de mapeo.

export const JOB_STATUSES = ['pending', 'preparing', 'printing', 'postprocessing', 'done', 'delivered', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const JOB_KINDS = ['personal', 'commission'] as const
export type JobKind = (typeof JOB_KINDS)[number]

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

export const COMPONENT_STATUSES = ['pending', 'printing', 'done'] as const
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number]

export type DataSource = 'manual' | 'imported'

export interface Job {
  id: string
  name: string
  description: string
  kind: JobKind
  is_mandatory: boolean
  client_name: string | null
  quantity: number
  priority: Priority
  status: JobStatus
  due_date: string // YYYY-MM-DD
  estimated_finish_date: string | null
  notes: string
  sale_price: number | null
  extra_costs: number
  cover_path: string | null
  archived_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface JobComponent {
  id: string
  job_id: string
  name: string
  description: string
  qty_per_unit: number
  batch_capacity: number
  batch_minutes: number
  last_batch_minutes: number | null
  waste_grams_per_batch: number
  completed_qty: number
  failed_qty: number
  status: ComponentStatus
  notes: string
  position: number
  time_source: DataSource
  created_at: string
  updated_at: string
}

export interface ComponentColor {
  id: string
  component_id: string
  material_id: string | null
  grams_per_batch: number
  source: DataSource
}

export interface Material {
  id: string
  type: string
  brand: string
  name: string
  color_hex: string
  price_per_kg: number
  notes: string
  created_at: string
}

export interface Settings {
  hours_per_day: number
  printer_watts: number
  kwh_price: number
  default_price_per_kg: number
  currency: string
}

export const DEFAULT_SETTINGS: Settings = {
  hours_per_day: 8,
  printer_watts: 100,
  kwh_price: 0.2,
  default_price_per_kg: 20,
  currency: 'EUR',
}

export interface ProductionLogEntry {
  id: string
  component_id: string
  completed_delta: number
  failed_delta: number
  note: string
  created_at: string
}
