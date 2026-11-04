import { describe, expect, it } from 'vitest'
import {
  batchesFor, checkCompleted, deadlineState, isUrgent, piecesNeeded, piecesPending, planJob, schedule, suggestFinishDate,
  type PricingContext,
} from './calc'
import { addDaysISO, diffDays, isValidISODate } from './dates'
import type { ComponentColor, Job, JobComponent, Material } from './types'

const job = (o: Partial<Job> = {}): Job => ({
  id: 'j1', name: 'Figuras', description: '', kind: 'commission', is_mandatory: true, client_name: null, quantity: 33,
  priority: 'normal', status: 'pending', due_date: '2026-12-01', estimated_finish_date: null, notes: '', sale_price: null,
  extra_costs: 0, cover_path: null, archived_at: null, completed_at: null, created_at: '', updated_at: '', ...o,
})
const comp = (o: Partial<JobComponent> = {}): JobComponent => ({
  id: 'c1', job_id: 'j1', name: 'Figura', description: '', qty_per_unit: 1, batch_capacity: 1, batch_minutes: 120,
  last_batch_minutes: null, waste_grams_per_batch: 0, completed_qty: 0, failed_qty: 0, status: 'pending', notes: '',
  position: 0, time_source: 'manual', created_at: '', updated_at: '', ...o,
})
const color = (o: Partial<ComponentColor> = {}): ComponentColor => ({
  id: 'k1', component_id: 'c1', material_id: 'm1', grams_per_batch: 40, source: 'manual', ...o,
})
const mat = (id: string, price: number): Material => ({
  id, type: 'PLA', brand: '', name: id, color_hex: '#fff', price_per_kg: price, notes: '', created_at: '',
})
const ctx = (materials: Material[] = [mat('m1', 20), mat('m2', 30)]): PricingContext => ({
  materials: new Map(materials.map((m) => [m.id, m])),
  settings: { default_price_per_kg: 25, kwh_price: 0.2, printer_watts: 100 },
})

describe('cantidades y tandas (casos obligatorios)', () => {
  it('33 unidades, una por tanda → 33 impresiones', () => {
    expect(batchesFor(piecesNeeded(33, 1), 1)).toBe(33)
  })
  it('44 unidades, cuatro por tanda → 11 impresiones', () => {
    expect(batchesFor(piecesNeeded(44, 1), 4)).toBe(11)
  })
  it('44 unidades, tres por tanda → 15 impresiones', () => {
    expect(batchesFor(piecesNeeded(44, 1), 3)).toBe(15)
  })
  it('piezas necesarias = productos × piezas por producto', () => {
    expect(piecesNeeded(44, 2)).toBe(88)
  })
  it('0 piezas → 0 impresiones', () => {
    expect(batchesFor(0, 4)).toBe(0)
  })
  it('rechaza capacidad inválida y cantidades no enteras', () => {
    expect(() => batchesFor(10, 0)).toThrow(RangeError)
    expect(() => batchesFor(1.5, 2)).toThrow(RangeError)
    expect(() => piecesNeeded(-1, 1)).toThrow(RangeError)
  })
  it('piezas pendientes nunca negativas', () => {
    expect(piecesPending(33, 18)).toBe(15)
    expect(piecesPending(33, 40)).toBe(0)
  })
})

describe('tiempo por tanda y última tanda parcial', () => {
  const t = { batch_capacity: 4, batch_minutes: 100, last_batch_minutes: null }
  it('tandas completas: minutos = tandas × tiempo de tanda (no por unidad)', () => {
    expect(schedule(44, t)).toMatchObject({ batches: 11, minutes: 1100, partialPieces: null })
  })
  it('tanda parcial usa tiempo completo y se marca como conservadora', () => {
    expect(schedule(42, t)).toEqual({ batches: 11, minutes: 1100, partialPieces: 2, partialIsConservative: true })
  })
  it('tanda parcial con tiempo específico no es conservadora', () => {
    expect(schedule(42, { ...t, last_batch_minutes: 60 })).toEqual({
      batches: 11, minutes: 10 * 100 + 60, partialPieces: 2, partialIsConservative: false,
    })
  })
  it('sin piezas → sin tiempo', () => {
    expect(schedule(0, t).minutes).toBe(0)
  })
})

describe('planJob: progreso y recálculo', () => {
  it('18 de 33 figuras → 55 %, 15 pendientes, 15 impresiones restantes', () => {
    const plan = planJob(job(), [comp({ completed_qty: 18 })], new Map(), ctx())
    expect(Math.round(plan.progress * 100)).toBe(55)
    expect(plan.components[0]).toMatchObject({ piecesPending: 15 })
    expect(plan.remaining.batches).toBe(15)
    expect(plan.remaining.minutes).toBe(15 * 120)
    expect(plan.unitsCompleted).toBe(18)
    expect(plan.unitsPending).toBe(15)
  })
  it('actualizar cantidades recalcula el plan', () => {
    const before = planJob(job(), [comp({ completed_qty: 18 })], new Map(), ctx())
    const after = planJob(job(), [comp({ completed_qty: 30 })], new Map(), ctx())
    expect(after.remaining.batches).toBe(3)
    expect(after.remaining.batches).toBeLessThan(before.remaining.batches)
    expect(after.total.batches).toBe(before.total.batches)
  })
  it('suma varios componentes (figura + peana ×4 + accesorio ×3)', () => {
    const j = job({ quantity: 44 })
    const plan = planJob(
      j,
      [
        comp({ id: 'a', batch_capacity: 1 }),
        comp({ id: 'b', batch_capacity: 4 }),
        comp({ id: 'c', batch_capacity: 3 }),
      ],
      new Map(),
      ctx(),
    )
    expect(plan.components.map((p) => p.total.batches)).toEqual([44, 11, 15])
    expect(plan.total.batches).toBe(70)
  })
  it('productos completos = mínimo entre componentes', () => {
    const j = job({ quantity: 10 })
    const plan = planJob(
      j,
      [comp({ id: 'a', completed_qty: 10 }), comp({ id: 'b', qty_per_unit: 2, completed_qty: 7 })],
      new Map(),
      ctx(),
    )
    expect(plan.unitsCompleted).toBe(3)
  })
  it('sobreproducción no suma progreso y se señala', () => {
    const plan = planJob(job({ quantity: 10 }), [comp({ completed_qty: 12 })], new Map(), ctx())
    expect(plan.progress).toBe(1)
    expect(plan.hasOverproduction).toBe(true)
    expect(plan.remaining.batches).toBe(0)
  })
  it('trabajo sin componentes: sin progreso ni NaN', () => {
    const plan = planJob(job(), [], new Map(), ctx())
    expect(plan.progress).toBe(0)
    expect(plan.unitsCompleted).toBe(0)
    expect(plan.margin).toBeNull()
  })
})

describe('consumos y costes', () => {
  it('varios colores suman sin duplicar; escala con las piezas', () => {
    // 8 piezas, 4 por tanda → 2 tandas. Colores: 40 g y 20 g por tanda → 80 g + 40 g.
    const colors = [color({ id: 'k1', material_id: 'm1', grams_per_batch: 40 }), color({ id: 'k2', material_id: 'm2', grams_per_batch: 20 })]
    const plan = planJob(job({ quantity: 8 }), [comp({ batch_capacity: 4 })], new Map([['c1', colors]]), ctx())
    expect(plan.total.grams).toBeCloseTo(120)
    const byMat = Object.fromEntries(plan.total.usage.map((u) => [u.materialId, u.grams]))
    expect(byMat.m1).toBeCloseTo(80)
    expect(byMat.m2).toBeCloseTo(40)
  })
  it('tanda parcial: el material escala con las piezas, el desperdicio es fijo por tanda', () => {
    // 6 piezas, 4 por tanda → 2 tandas (4 + 2). Pieza: 40 g/tanda = 10 g/pieza → 60 g. Purga 5 g × 2 tandas = 10 g.
    const plan = planJob(job({ quantity: 6 }), [comp({ batch_capacity: 4, waste_grams_per_batch: 5 })], new Map([['c1', [color()]]]), ctx())
    expect(plan.total.grams).toBeCloseTo(70)
  })
  it('desperdicio sin colores se valora al precio por defecto', () => {
    const plan = planJob(job({ quantity: 2 }), [comp({ waste_grams_per_batch: 10 })], new Map(), ctx())
    expect(plan.total.usage).toEqual([{ materialId: null, grams: 20 }])
    expect(plan.total.filamentCost).toBeCloseTo((20 / 1000) * 25)
  })
  it('coste de filamento, electricidad, extras, total y margen', () => {
    // 10 piezas, 1 por tanda, 60 min, 50 g/tanda @ 20 €/kg, 100 W @ 0,2 €/kWh.
    const j = job({ quantity: 10, extra_costs: 3, sale_price: 100 })
    const plan = planJob(j, [comp({ batch_minutes: 60 })], new Map([['c1', [color({ grams_per_batch: 50 })]]]), ctx())
    expect(plan.total.filamentCost).toBeCloseTo(10 * 0.05 * 20) // 10 €
    expect(plan.total.electricityCost).toBeCloseTo(10 * 0.1 * 0.2) // 0,20 €
    expect(plan.totalCost).toBeCloseTo(13.2)
    expect(plan.margin).toBeCloseTo(86.8)
  })
  it('coste restante baja al completar piezas', () => {
    const j = job({ quantity: 10 })
    const colors = new Map([['c1', [color({ grams_per_batch: 50 })]]])
    const half = planJob(j, [comp({ batch_minutes: 60, completed_qty: 5 })], colors, ctx())
    expect(half.remaining.grams).toBeCloseTo(250)
    expect(half.remainingCost).toBeCloseTo(half.total.filamentCost / 2 + half.total.electricityCost / 2)
  })
  it('material desconocido cae al precio por defecto', () => {
    const plan = planJob(job({ quantity: 1 }), [comp()], new Map([['c1', [color({ material_id: 'borrado', grams_per_batch: 1000 })]]]), ctx())
    expect(plan.total.filamentCost).toBeCloseTo(25)
  })
})

describe('fechas y urgencia', () => {
  it('suma días y calcula diferencias', () => {
    expect(addDaysISO('2026-12-30', 3)).toBe('2027-01-02')
    expect(diffDays('2026-12-01', '2026-11-04')).toBe(27)
    expect(diffDays('2026-11-01', '2026-11-04')).toBe(-3)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-02-28')).toBe(true)
  })
  it('fecha sugerida a partir de horas por día', () => {
    expect(suggestFinishDate(60 * 20, 8, '2026-11-04')).toBe('2026-11-07') // 20 h / 8 h → 3 días
    expect(suggestFinishDate(0, 8, '2026-11-04')).toBe('2026-11-04')
    expect(suggestFinishDate(100, 0, '2026-11-04')).toBeNull()
  })
  const base = { status: 'pending', archived_at: null, due_date: '2026-11-20', estimated_finish_date: null } as const
  it('estados de fecha límite', () => {
    expect(deadlineState(base, null, '2026-11-04')).toBe('ok')
    expect(deadlineState(base, null, '2026-11-15')).toBe('due_soon')
    expect(deadlineState(base, null, '2026-11-21')).toBe('overdue')
    expect(deadlineState({ ...base, estimated_finish_date: '2026-11-25' }, null, '2026-11-04')).toBe('at_risk')
    expect(deadlineState(base, '2026-11-30', '2026-11-04')).toBe('at_risk')
    expect(deadlineState({ ...base, status: 'done' }, null, '2026-12-31')).toBe('closed')
  })
  it('urgencia independiente de la obligatoriedad', () => {
    const today = '2026-11-04'
    expect(isUrgent(job({ is_mandatory: true, due_date: '2026-12-31' }), today)).toBe(false)
    expect(isUrgent(job({ is_mandatory: true, due_date: '2026-11-08' }), today)).toBe(true)
    expect(isUrgent(job({ is_mandatory: false, due_date: '2026-11-08' }), today)).toBe(false)
    expect(isUrgent(job({ is_mandatory: false, priority: 'urgent', due_date: '2026-12-31' }), today)).toBe(true)
    expect(isUrgent(job({ status: 'delivered', priority: 'urgent' }), today)).toBe(false)
  })
})

describe('validación de cantidades', () => {
  it('advierte de cantidades imposibles', () => {
    expect(checkCompleted(-1, 33)).toBe('negative')
    expect(checkCompleted(34, 33)).toBe('exceeds_needed')
    expect(checkCompleted(33, 33)).toBeNull()
  })
})
