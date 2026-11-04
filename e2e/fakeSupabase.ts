import type { Page, Route } from '@playwright/test'

export const FAKE_URL = 'https://fake.supabase.test'
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

type Row = Record<string, any>

/**
 * Supabase simulado a nivel de red (PostgREST + Auth mínimos) para probar la interfaz sin backend.
 * La seguridad real (RLS) se verifica contra PostgreSQL en supabase/tests.
 */
export class FakeSupabase {
  tables: Record<string, Row[]> = {
    jobs: [], job_components: [], component_colors: [], materials: [], production_log: [],
    settings: [{ singleton: true, hours_per_day: 8, printer_watts: 100, kwh_price: 0.2, default_price_per_kg: 20, currency: 'EUR' }],
  }
  owner = true
  requests: string[] = []

  async install(page: Page) {
    await page.route(`${FAKE_URL}/**`, (route) => this.handle(route))
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
      body: JSON.stringify(body),
    })
  }

  private match(rows: Row[], params: URLSearchParams) {
    let out = rows
    for (const [k, v] of params) {
      if (v.startsWith('eq.')) out = out.filter((r) => String(r[k]) === v.slice(3))
    }
    return out
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    this.requests.push(`${method} ${url.pathname}`)
    if (method === 'OPTIONS') return this.json(route, {})

    if (url.pathname === '/auth/v1/token') {
      const exp = Math.floor(Date.now() / 1000) + 3600
      const user = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', email: 'yo@example.com', app_metadata: {}, user_metadata: {}, created_at: now() }
      return this.json(route, { access_token: `h.${btoa(JSON.stringify({ sub: user.id, exp }))}.s`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user })
    }
    if (url.pathname === '/auth/v1/logout') return this.json(route, {}, 204)
    if (url.pathname === '/rest/v1/rpc/is_owner') return this.json(route, this.owner)
    if (url.pathname === '/rest/v1/rpc/duplicate_job') return this.duplicate(route, JSON.parse(req.postData() ?? '{}').p_job_id)

    const table = url.pathname.replace('/rest/v1/', '')
    const rows = this.tables[table]
    if (!rows) return this.json(route, { message: 'not found' }, 404)
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')

    if (method === 'GET') {
      const found = this.match(rows, url.searchParams)
      return this.json(route, single ? (found[0] ?? null) : found)
    }
    if (method === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}') as Row
      const row: Row = { id: uid(), created_at: now(), updated_at: now(), archived_at: null, completed_at: null, ...defaults(table), ...body }
      if (table === 'production_log') this.applyLog(row)
      else rows.push(row)
      return this.json(route, single ? row : [row], 201)
    }
    if (method === 'PATCH') {
      const found = this.match(rows, url.searchParams)
      const patch = JSON.parse(req.postData() ?? '{}') as Row
      for (const r of found) {
        Object.assign(r, patch, { updated_at: now() })
        if (table === 'jobs') r.completed_at = ['done', 'delivered'].includes(r.status) ? (r.completed_at ?? now()) : null
      }
      return this.json(route, single ? (found[0] ?? null) : found)
    }
    if (method === 'DELETE') {
      const found = new Set(this.match(rows, url.searchParams))
      this.tables[table] = rows.filter((r) => !found.has(r))
      if (table === 'jobs') this.tables.job_components = this.tables.job_components!.filter((c) => this.tables.jobs!.some((j) => j.id === c.job_id))
      return this.json(route, null, 204)
    }
    return this.json(route, { message: 'unsupported' }, 400)
  }

  private applyLog(row: Row) {
    const c = this.tables.job_components!.find((x) => x.id === row.component_id)
    if (!c) return
    c.completed_qty += row.completed_delta
    c.failed_qty += row.failed_delta
    this.tables.production_log!.push(row)
  }

  private duplicate(route: Route, id: string) {
    const j = this.tables.jobs!.find((x) => x.id === id)!
    const copy = { ...j, id: uid(), name: `${j.name} (copia)`, status: 'pending', completed_at: null, archived_at: null }
    this.tables.jobs!.push(copy)
    for (const c of this.tables.job_components!.filter((x) => x.job_id === id))
      this.tables.job_components!.push({ ...c, id: uid(), job_id: copy.id, completed_qty: 0, failed_qty: 0 })
    return this.json(route, copy.id)
  }
}

function defaults(table: string): Row {
  if (table === 'jobs')
    return { description: '', notes: '', client_name: null, estimated_finish_date: null, sale_price: null, extra_costs: 0, cover_path: null }
  if (table === 'job_components')
    return { description: '', notes: '', last_batch_minutes: null, waste_grams_per_batch: 0, completed_qty: 0, failed_qty: 0, status: 'pending', position: 0, time_source: 'manual' }
  return {}
}
