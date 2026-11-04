import { addDaysISO, diffDays } from './dates'
import type { ComponentColor, Job, JobComponent, Material, Settings } from './types'

// ---------- Primitivas de cantidades y tandas ----------

function assertInt(value: number, min: number, label: string) {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`${label} debe ser un entero ≥ ${min} (recibido ${value})`)
}

/** piezas_necesarias = cantidad_productos × piezas_por_producto */
export function piecesNeeded(quantity: number, perUnit: number): number {
  assertInt(quantity, 0, 'La cantidad')
  assertInt(perUnit, 1, 'Las piezas por producto')
  return quantity * perUnit
}

/** impresiones = ceil(piezas / capacidad_por_tanda) */
export function batchesFor(pieces: number, capacity: number): number {
  assertInt(pieces, 0, 'Las piezas')
  assertInt(capacity, 1, 'La capacidad por tanda')
  return Math.ceil(pieces / capacity)
}

/** piezas_pendientes = max(0, necesarias − completadas) */
export function piecesPending(needed: number, completed: number): number {
  return Math.max(0, needed - completed)
}

export interface BatchTiming {
  batch_capacity: number
  batch_minutes: number
  last_batch_minutes: number | null
}

export interface Schedule {
  batches: number
  minutes: number
  /** Piezas de la última tanda si no está llena; null si todas las tandas están completas. */
  partialPieces: number | null
  /** La tanda parcial usa el tiempo de una tanda completa (estimación conservadora). */
  partialIsConservative: boolean
}

/**
 * Tiempo de imprimir `pieces` piezas. El tiempo es por TANDA, no por unidad.
 * La última tanda parcial usa `last_batch_minutes` si existe; si no, el tiempo de tanda completa (conservador).
 */
export function schedule(pieces: number, t: BatchTiming): Schedule {
  const batches = batchesFor(pieces, t.batch_capacity)
  if (batches === 0) return { batches: 0, minutes: 0, partialPieces: null, partialIsConservative: false }
  const remainder = pieces % t.batch_capacity
  if (remainder === 0) return { batches, minutes: batches * t.batch_minutes, partialPieces: null, partialIsConservative: false }
  const hasOverride = t.last_batch_minutes != null
  const lastMinutes = hasOverride ? t.last_batch_minutes! : t.batch_minutes
  return {
    batches,
    minutes: (batches - 1) * t.batch_minutes + lastMinutes,
    partialPieces: remainder,
    partialIsConservative: !hasOverride,
  }
}

// ---------- Consumos y costes ----------

export interface PricingContext {
  materials: ReadonlyMap<string, Material>
  settings: Pick<Settings, 'default_price_per_kg' | 'kwh_price' | 'printer_watts'>
}

export interface MaterialUsage {
  /** null = sin material asignado (se valora al precio por defecto). */
  materialId: string | null
  grams: number
}

const pricePerKg = (materialId: string | null, ctx: PricingContext) =>
  (materialId ? ctx.materials.get(materialId)?.price_per_kg : undefined) ?? ctx.settings.default_price_per_kg

/**
 * Gramos por material para `pieces` piezas repartidas en `batches` tandas.
 * - Material de pieza: gramos_por_tanda / capacidad × piezas (escala con las piezas).
 * - Desperdicio/purga: fijo por tanda, repartido entre colores en proporción a su consumo.
 * Cada color es una fila: el total del componente es la suma, nunca se duplica.
 */
export function usageFor(
  pieces: number,
  batches: number,
  capacity: number,
  colors: readonly ComponentColor[],
  wastePerBatch: number,
): MaterialUsage[] {
  if (pieces === 0) return []
  const wasteTotal = wastePerBatch * batches
  const partsGrams = colors.reduce((s, c) => s + c.grams_per_batch, 0)
  if (colors.length === 0) return wasteTotal > 0 ? [{ materialId: null, grams: wasteTotal }] : []
  const merged = new Map<string | null, number>()
  for (const c of colors) {
    const own = (c.grams_per_batch / capacity) * pieces
    const share = partsGrams > 0 ? c.grams_per_batch / partsGrams : 1 / colors.length
    merged.set(c.material_id, (merged.get(c.material_id) ?? 0) + own + wasteTotal * share)
  }
  return [...merged].map(([materialId, grams]) => ({ materialId, grams }))
}

export const gramsOf = (usage: readonly MaterialUsage[]) => usage.reduce((s, u) => s + u.grams, 0)

export const filamentCost = (usage: readonly MaterialUsage[], ctx: PricingContext) =>
  usage.reduce((s, u) => s + (u.grams / 1000) * pricePerKg(u.materialId, ctx), 0)

export const electricityCost = (minutes: number, ctx: PricingContext) =>
  (minutes / 60) * (ctx.settings.printer_watts / 1000) * ctx.settings.kwh_price

export function mergeUsage(list: readonly (readonly MaterialUsage[])[]): MaterialUsage[] {
  const m = new Map<string | null, number>()
  for (const u of list.flat()) m.set(u.materialId, (m.get(u.materialId) ?? 0) + u.grams)
  return [...m].map(([materialId, grams]) => ({ materialId, grams }))
}

// ---------- Plan por componente ----------

export interface Totals {
  batches: number
  minutes: number
  usage: MaterialUsage[]
  grams: number
  filamentCost: number
  electricityCost: number
}

export interface ComponentPlan {
  componentId: string
  piecesNeeded: number
  piecesCompleted: number
  piecesPending: number
  /** Se han registrado más piezas de las necesarias. */
  overproduced: boolean
  /** Fracción 0..1 (las piezas sobrantes no suman). */
  progress: number
  total: Totals
  remaining: Totals
  partialPieces: number | null
  partialIsConservative: boolean
}

function totals(pieces: number, c: JobComponent, colors: readonly ComponentColor[], ctx: PricingContext): { t: Totals; s: Schedule } {
  const s = schedule(pieces, c)
  const usage = usageFor(pieces, s.batches, c.batch_capacity, colors, c.waste_grams_per_batch)
  return {
    s,
    t: {
      batches: s.batches,
      minutes: s.minutes,
      usage,
      grams: gramsOf(usage),
      filamentCost: filamentCost(usage, ctx),
      electricityCost: electricityCost(s.minutes, ctx),
    },
  }
}

export function planComponent(
  job: Pick<Job, 'quantity'>,
  c: JobComponent,
  colors: readonly ComponentColor[],
  ctx: PricingContext,
): ComponentPlan {
  const needed = piecesNeeded(job.quantity, c.qty_per_unit)
  const pending = piecesPending(needed, c.completed_qty)
  const full = totals(needed, c, colors, ctx)
  const rest = totals(pending, c, colors, ctx)
  return {
    componentId: c.id,
    piecesNeeded: needed,
    piecesCompleted: c.completed_qty,
    piecesPending: pending,
    overproduced: c.completed_qty > needed,
    progress: needed === 0 ? 0 : Math.min(c.completed_qty, needed) / needed,
    total: full.t,
    remaining: rest.t,
    partialPieces: full.s.partialPieces,
    partialIsConservative: full.s.partialIsConservative,
  }
}

// ---------- Plan por trabajo ----------

export interface JobPlan {
  components: ComponentPlan[]
  total: Totals
  remaining: Totals
  piecesNeeded: number
  piecesCompleted: number
  /** Fracción 0..1 ponderada por piezas. */
  progress: number
  /** Productos finales completos (todos sus componentes listos). */
  unitsCompleted: number
  unitsPending: number
  extraCosts: number
  /** Coste total estimado (filamento + electricidad + extras). */
  totalCost: number
  /** Coste de lo que queda por imprimir (sin extras fijos). */
  remainingCost: number
  /** Precio de venta − coste total; null si no hay precio de venta. */
  margin: number | null
  hasConservativeEstimate: boolean
  hasOverproduction: boolean
}

export function planJob(
  job: Job,
  components: readonly JobComponent[],
  colorsByComponent: ReadonlyMap<string, readonly ComponentColor[]>,
  ctx: PricingContext,
): JobPlan {
  const plans = components.map((c) => planComponent(job, c, colorsByComponent.get(c.id) ?? [], ctx))
  const sum = (pick: (t: Totals) => number, which: 'total' | 'remaining') => plans.reduce((s, p) => s + pick(p[which]), 0)
  const agg = (which: 'total' | 'remaining'): Totals => {
    const usage = mergeUsage(plans.map((p) => p[which].usage))
    return {
      batches: sum((t) => t.batches, which),
      minutes: sum((t) => t.minutes, which),
      usage,
      grams: gramsOf(usage),
      filamentCost: sum((t) => t.filamentCost, which),
      electricityCost: sum((t) => t.electricityCost, which),
    }
  }
  const total = agg('total')
  const remaining = agg('remaining')
  const needed = plans.reduce((s, p) => s + p.piecesNeeded, 0)
  const done = plans.reduce((s, p) => s + Math.min(p.piecesCompleted, p.piecesNeeded), 0)
  const unitsCompleted =
    components.length === 0
      ? 0
      : Math.min(job.quantity, ...components.map((c) => Math.floor(c.completed_qty / c.qty_per_unit)))
  const totalCost = total.filamentCost + total.electricityCost + job.extra_costs
  return {
    components: plans,
    total,
    remaining,
    piecesNeeded: needed,
    piecesCompleted: done,
    progress: needed === 0 ? 0 : done / needed,
    unitsCompleted,
    unitsPending: job.quantity - unitsCompleted,
    extraCosts: job.extra_costs,
    totalCost,
    remainingCost: remaining.filamentCost + remaining.electricityCost,
    margin: job.sale_price == null ? null : job.sale_price - totalCost,
    hasConservativeEstimate: plans.some((p) => p.partialIsConservative),
    hasOverproduction: plans.some((p) => p.overproduced),
  }
}

// ---------- Fechas y urgencia ----------

/** Fecha orientativa de finalización: minutos restantes / horas útiles por día, desde `from`. Null si no hay datos. */
export function suggestFinishDate(remainingMinutes: number, hoursPerDay: number, from: string): string | null {
  if (hoursPerDay <= 0) return null
  if (remainingMinutes <= 0) return from
  return addDaysISO(from, Math.ceil(remainingMinutes / 60 / hoursPerDay))
}

export const URGENT_WINDOW_DAYS = 7

export const isActiveJob = (j: Pick<Job, 'status' | 'archived_at'>) =>
  !j.archived_at && j.status !== 'done' && j.status !== 'delivered' && j.status !== 'cancelled'

export type DeadlineState = 'closed' | 'overdue' | 'at_risk' | 'due_soon' | 'ok'

/**
 * - overdue: vencido y sin terminar.
 * - at_risk: la fecha estimada (manual o sugerida) supera la fecha límite.
 * - due_soon: vence en ≤ 7 días.
 */
export function deadlineState(
  job: Pick<Job, 'status' | 'archived_at' | 'due_date' | 'estimated_finish_date'>,
  suggestedFinish: string | null,
  today: string,
): DeadlineState {
  if (!isActiveJob(job)) return 'closed'
  const left = diffDays(job.due_date, today)
  if (left < 0) return 'overdue'
  const estimates = [job.estimated_finish_date, suggestedFinish].filter((d): d is string => !!d)
  if (estimates.some((d) => diffDays(d, job.due_date) > 0)) return 'at_risk'
  if (left <= URGENT_WINDOW_DAYS) return 'due_soon'
  return 'ok'
}

/** Urgente: prioridad urgente, vencido, o encargo obligatorio que vence pronto. Independiente de la obligatoriedad por sí sola. */
export function isUrgent(job: Job, today: string): boolean {
  if (!isActiveJob(job)) return false
  if (job.priority === 'urgent') return true
  const left = diffDays(job.due_date, today)
  return left < 0 || (job.is_mandatory && left <= URGENT_WINDOW_DAYS)
}

// ---------- Validación de cantidades registradas ----------

export type QuantityIssue = 'negative' | 'exceeds_needed'

/** Devuelve un aviso si la cantidad completada propuesta es imposible o excede lo necesario. */
export function checkCompleted(proposed: number, needed: number): QuantityIssue | null {
  if (proposed < 0) return 'negative'
  if (proposed > needed) return 'exceeds_needed'
  return null
}
