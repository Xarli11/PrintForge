// Fechas de calendario como cadenas YYYY-MM-DD en hora local (sin desfases por zona horaria).

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now)
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) throw new RangeError(`Fecha inválida: ${iso}`)
  return Date.UTC(y, m - 1, d)
}

export function addDaysISO(iso: string, days: number): string {
  const t = new Date(utcDay(iso) + days * 86_400_000)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Días naturales de `from` a `to` (negativo si `to` es anterior). */
export function diffDays(to: string, from: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000)
}

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y!, m! - 1, d!))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m! - 1 && t.getUTCDate() === d
}
