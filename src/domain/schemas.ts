import { z } from 'zod'
import { isValidISODate } from './dates'
import { COMPONENT_STATUSES, JOB_KINDS, JOB_STATUSES, PRIORITIES } from './types'

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`)
const int = (min: number, max: number, label: string) =>
  z.number({ error: `${label}: introduce un número` }).int(`${label}: debe ser entero`).min(min, `${label}: mínimo ${min}`).max(max, `${label}: máximo ${max}`)
const money = (label: string) => z.number({ error: `${label}: introduce un número` }).min(0, `${label}: no puede ser negativo`).max(1e7)
const isoDate = z.string().refine(isValidISODate, 'Fecha no válida')

export const jobSchema = z.object({
  name: text(160).min(1, 'El nombre es obligatorio'),
  description: text(4000),
  kind: z.enum(JOB_KINDS),
  is_mandatory: z.boolean(),
  client_name: text(120).nullable(),
  quantity: int(1, 100000, 'Cantidad'),
  priority: z.enum(PRIORITIES),
  status: z.enum(JOB_STATUSES),
  due_date: z.string().min(1, 'La fecha límite es obligatoria').pipe(isoDate),
  estimated_finish_date: isoDate.nullable(),
  notes: text(4000),
  sale_price: money('Precio de venta').nullable(),
  extra_costs: money('Costes adicionales'),
})
export type JobInput = z.infer<typeof jobSchema>

export const componentSchema = z.object({
  name: text(160).min(1, 'El nombre es obligatorio'),
  description: text(2000),
  qty_per_unit: int(1, 1000, 'Piezas por producto'),
  batch_capacity: int(1, 1000, 'Capacidad por tanda'),
  batch_minutes: int(0, 100000, 'Tiempo por tanda'),
  last_batch_minutes: int(0, 100000, 'Tiempo de última tanda').nullable(),
  waste_grams_per_batch: money('Purga por tanda'),
  status: z.enum(COMPONENT_STATUSES),
  notes: text(2000),
})
export type ComponentInput = z.infer<typeof componentSchema>

export const settingsSchema = z.object({
  hours_per_day: z.number({ error: 'Horas por día: introduce un número' }).gt(0, 'Debe ser mayor que 0').max(24, 'Máximo 24'),
  printer_watts: money('Potencia'),
  kwh_price: money('Precio kWh'),
  default_price_per_kg: money('Precio por kg'),
})
export type SettingsInput = z.infer<typeof settingsSchema>

/** Devuelve un mapa campo → primer mensaje de error. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    out[key] ??= issue.message
  }
  return out
}
