const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('es-ES', opts)

export const formatInt = (n: number) => nf({ maximumFractionDigits: 0 }).format(n)
export const formatPercent = (fraction: number) => `${Math.round(fraction * 100)} %`

export function formatMoney(n: number, currency = 'EUR') {
  return nf({ style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
}

export function formatMinutes(total: number): string {
  const m = Math.round(total)
  if (m <= 0) return '0 min'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} min`
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

export function formatGrams(g: number): string {
  if (g >= 1000) return `${nf({ maximumFractionDigits: 2 }).format(g / 1000)} kg`
  return `${nf({ maximumFractionDigits: 0 }).format(g)} g`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y!, m! - 1, d!))
}

export function formatRelativeDays(days: number): string {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days === -1) return 'ayer'
  return days > 0 ? `en ${days} días` : `hace ${-days} días`
}
