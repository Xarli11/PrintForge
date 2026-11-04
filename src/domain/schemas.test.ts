import { describe, expect, it } from 'vitest'
import { componentSchema, fieldErrors, jobSchema, settingsSchema } from './schemas'

const validJob = {
  name: 'Figuras', description: '', kind: 'commission', is_mandatory: true, client_name: null, quantity: 33, priority: 'normal',
  status: 'pending', due_date: '2026-12-01', estimated_finish_date: null, notes: '', sale_price: null, extra_costs: 0,
} as const
const validComp = {
  name: 'Peana', description: '', qty_per_unit: 1, batch_capacity: 4, batch_minutes: 90, last_batch_minutes: null,
  waste_grams_per_batch: 0, status: 'pending', notes: '', file_id: null,
} as const

describe('validación de trabajos', () => {
  it('acepta un trabajo válido', () => expect(jobSchema.safeParse(validJob).success).toBe(true))
  it('la fecha límite es obligatoria', () => {
    const r = jobSchema.safeParse({ ...validJob, due_date: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(fieldErrors(r.error).due_date).toMatch(/obligatoria/)
  })
  it('rechaza fechas imposibles, cantidad 0 / decimal / NaN y nombre vacío', () => {
    for (const bad of [{ due_date: '2026-02-30' }, { quantity: 0 }, { quantity: 1.5 }, { quantity: NaN }, { name: '   ' }, { extra_costs: -1 }])
      expect(jobSchema.safeParse({ ...validJob, ...bad }).success, JSON.stringify(bad)).toBe(false)
  })
})

describe('validación de componentes y ajustes', () => {
  it('acepta un componente válido', () => expect(componentSchema.safeParse(validComp).success).toBe(true))
  it('rechaza capacidad 0 y tiempos negativos', () => {
    expect(componentSchema.safeParse({ ...validComp, batch_capacity: 0 }).success).toBe(false)
    expect(componentSchema.safeParse({ ...validComp, batch_minutes: -5 }).success).toBe(false)
  })
  it('ajustes: horas por día entre 0 y 24', () => {
    const ok = { hours_per_day: 8, printer_watts: 100, kwh_price: 0.2, default_price_per_kg: 20 }
    expect(settingsSchema.safeParse(ok).success).toBe(true)
    expect(settingsSchema.safeParse({ ...ok, hours_per_day: 0 }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...ok, hours_per_day: 25 }).success).toBe(false)
  })
})
