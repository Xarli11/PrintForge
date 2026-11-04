// Verificación manual-asistida contra Supabase REAL (sin mocks).
// Abre un Chromium visible; el propietario inicia sesión a mano (la contraseña nunca pasa por el script).
// Crea datos con prefijo "[e2e]" y los borra al final. Uso: node scripts/verify-real.mjs [url]
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const SHOTS = 'test-results/real'
mkdirSync(SHOTS, { recursive: true })

const envLines = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(String.fromCharCode(10))
const env = Object.fromEntries(envLines.map((l) => l.trim()).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const results = []
const NAME = '[e2e] 33 figuras'

const browser = await chromium.launch({ headless: false })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const rest = []
page.on('response', (r) => {
  if (r.url().includes('.supabase.co')) rest.push({ method: r.request().method(), path: new URL(r.url()).pathname, status: r.status() })
})
page.on('pageerror', (e) => results.push(['ERROR JS en la página', false, e.message]))

async function step(name, fn) {
  try {
    await fn()
    results.push([name, true])
    console.log('  OK  ', name)
  } catch (e) {
    results.push([name, false, String(e.message).split('\n')[0]])
    console.log('  FALLA', name, '→', String(e.message).split('\n')[0])
    await page.screenshot({ path: `${SHOTS}/fallo-${results.length}.png`, fullPage: true }).catch(() => {})
    throw e
  }
}
const dlg = () => page.getByRole('dialog')
const wait = { timeout: 20_000 }

try {
  await page.goto(BASE)
  console.log('>>> Inicia sesión en la ventana de Chromium (tienes 10 minutos)…')
  await step('Login real del propietario (manual)', async () => {
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 600_000 })
  })
  await page.screenshot({ path: `${SHOTS}/01-dashboard.png`, fullPage: true })

  await step('SEGURIDAD: authenticated no puede ejecutar rls_auto_enable(); is_owner() sí funciona', async () => {
    const t = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'))
      return k ? JSON.parse(localStorage.getItem(k)).access_token : null
    })
    const call = (fn) => fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: '{}' })
    const denied = await call('rls_auto_enable')
    const body = await denied.text()
    console.log('        rls_auto_enable (propietario): HTTP', denied.status, body.slice(0, 80))
    if (denied.status !== 401 || !body.includes('42501')) throw new Error('rls_auto_enable sigue siendo ejecutable por authenticated')
    const anonCall = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/rls_auto_enable`, { method: 'POST', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' }, body: '{}' })
    console.log('        rls_auto_enable (anónimo): HTTP', anonCall.status)
    if (anonCall.status !== 401) throw new Error('rls_auto_enable sigue siendo ejecutable por anon')
    const owner = await call('is_owner')
    if (owner.status !== 200 || (await owner.text()) !== 'true') throw new Error('is_owner() ya no funciona para el propietario')
  })

  await step('Sesión persiste tras recargar (token guardado)', async () => {
    await page.reload()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor(wait)
  })

  await step('Limpia restos previos de [e2e]', async () => {
    await page.goto(`${BASE}/#/jobs`)
    await page.getByLabel('Estado').selectOption('all')
    await page.getByLabel('Buscar trabajos').fill('[e2e]')
    await page.waitForTimeout(800)
    if ((await page.getByText('Ningún trabajo coincide').count()) + (await page.getByText('Aún no tienes trabajos').count()) === 0)
      throw new Error('Existen trabajos [e2e] previos: bórralos a mano antes de repetir')
  })

  await step('Crear trabajo (33 uds, obligatorio, cliente)', async () => {
    await page.getByRole('button', { name: 'Nuevo trabajo' }).click()
    await dlg().getByLabel('Nombre', { exact: true }).fill(NAME)
    await dlg().getByLabel('Cantidad de productos finales').fill('33')
    await dlg().getByLabel('Cliente (opcional)').fill('Cliente prueba')
    await dlg().getByRole('switch').click()
    await dlg().getByRole('button', { name: 'Crear trabajo' }).click()
    await page.getByRole('heading', { level: 1, name: NAME }).waitFor(wait)
  })

  await step('Componente Figura (1/tanda, 120 min) → 33 impresiones', async () => {
    await page.getByRole('button', { name: 'Añadir componente' }).click()
    await dlg().getByLabel('Nombre', { exact: true }).fill('Figura')
    await dlg().getByLabel('Tiempo por tanda (minutos)').fill('120')
    await dlg().getByText('33 impresiones').waitFor(wait)
    await dlg().getByRole('button', { name: 'Añadir componente' }).click()
    await page.getByRole('heading', { name: 'Figura', exact: true }).waitFor(wait)
  })

  await step('Componente Peana (4/tanda, 90 min) → 9 impresiones; total 42', async () => {
    await page.getByRole('button', { name: 'Componente', exact: true }).click()
    await dlg().getByLabel('Nombre', { exact: true }).fill('Peana')
    await dlg().getByLabel('Piezas que caben por tanda').fill('4')
    await dlg().getByLabel('Tiempo por tanda (minutos)').fill('90')
    await dlg().getByText('9 impresiones').waitFor(wait)
    await dlg().getByRole('button', { name: 'Añadir componente' }).click()
    await page.getByRole('heading', { name: 'Peana', exact: true }).waitFor(wait)
    await page.getByText('de 42 en total').waitFor(wait)
  })

  await step('Registrar 18 figuras → 55 %, 15 de 33 impresiones', async () => {
    await page.getByRole('button', { name: 'Ajustar…' }).first().click()
    await dlg().getByLabel(/Piezas completadas/).fill('18')
    await dlg().getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByText('15 de 33').waitFor(wait)
    const v = await page.getByRole('progressbar', { name: 'Progreso de Figura' }).getAttribute('aria-valuenow')
    if (v !== '55') throw new Error(`progreso ${v} ≠ 55`)
  })

  await step('Botón rápido +1 y registro de fallo', async () => {
    await page.getByRole('button', { name: 'Sumar una pieza a Figura' }).click()
    await page.getByText('14 de 33').waitFor(wait)
    await page.getByRole('button', { name: 'Registrar fallo en Figura' }).click()
    await page.getByText('1 fallida').waitFor(wait)
  })

  await step('Botón +tanda en Peana (4 piezas)', async () => {
    await page.getByRole('button', { name: /Sumar una tanda de 4 piezas a Peana/ }).click()
    await page.getByText('8 de 9').waitFor(wait)
  })

  await step('Aviso al superar lo necesario (no guarda sin confirmar)', async () => {
    await page.getByRole('button', { name: 'Ajustar…' }).first().click()
    await dlg().getByLabel(/Piezas completadas/).fill('40')
    await dlg().getByRole('button', { name: 'Guardar', exact: true }).click()
    await dlg().getByRole('alert').getByText(/supera/).waitFor(wait)
    await dlg().getByRole('button', { name: 'Cancelar' }).click()
    await page.getByText('19 / 33 piezas', { exact: false }).first().waitFor(wait)
  })
  await page.screenshot({ path: `${SHOTS}/02-detalle.png`, fullPage: true })

  await step('Los datos persisten tras recargar (19 figuras, 4 peanas, 1 fallo)', async () => {
    await page.reload()
    await page.getByRole('heading', { name: 'Figura', exact: true }).waitFor(wait)
    await page.getByText('14 de 33').waitFor(wait)
    await page.getByText('1 fallida').waitFor(wait)
    await page.getByText('8 de 9').waitFor(wait)
  })

  await step('Editar trabajo (nombre y prioridad alta) y persistir', async () => {
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
    await dlg().getByLabel('Nombre', { exact: true }).fill(`${NAME} (editado)`)
    await dlg().getByLabel('Prioridad').selectOption('high')
    await dlg().getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByRole('heading', { level: 1, name: `${NAME} (editado)` }).waitFor(wait)
    await page.reload()
    await page.getByRole('heading', { level: 1, name: `${NAME} (editado)` }).waitFor(wait)
    await page.getByText('Prioridad alta').first().waitFor(wait)
  })

  await step('Cambiar estado a Imprimiendo', async () => {
    await page.getByLabel('Estado del trabajo').selectOption('printing')
    await page.getByRole('heading', { level: 1 }).waitFor(wait)
    await page.waitForTimeout(800)
    await page.reload()
    await page.getByLabel('Estado del trabajo').waitFor(wait)
    if ((await page.getByLabel('Estado del trabajo').inputValue()) !== 'printing') throw new Error('estado no persistido')
  })

  await step('Duplicar (RPC real): copia con componentes y progreso a cero', async () => {
    await page.getByRole('button', { name: 'Duplicar' }).click()
    await page.getByRole('heading', { level: 1, name: `${NAME} (editado) (copia)` }).waitFor(wait)
    await page.getByRole('heading', { name: 'Figura', exact: true }).waitFor(wait)
    await page.getByRole('heading', { name: 'Peana', exact: true }).waitFor(wait)
    await page.getByText('33 de 33').first().waitFor(wait)
    await page.getByText('0 de 33 productos completos').waitFor(wait)
  })

  await step('Archivar la copia: sale de activos y aparece en Archivados', async () => {
    await page.getByRole('button', { name: 'Archivar' }).click()
    await page.getByText('Archivado', { exact: true }).waitFor(wait)
    await page.goto(`${BASE}/#/jobs`)
    await page.getByLabel('Buscar trabajos').fill('[e2e]')
    await page.waitForTimeout(600)
    if ((await page.getByRole('heading', { name: '(copia)' }).count()) !== 0) throw new Error('la copia archivada sigue en activos')
    await page.getByLabel('Archivados').check()
    await page.getByRole('heading', { name: `${NAME} (editado) (copia)` }).waitFor(wait)
    await page.getByLabel('Archivados').uncheck()
  })

  await step('Restaurar la copia', async () => {
    await page.getByRole('heading', { name: `${NAME} (editado) (copia)` }).count()
    await page.getByLabel('Archivados').check()
    await page.getByRole('heading', { name: `${NAME} (editado) (copia)` }).click()
    await page.getByRole('button', { name: 'Restaurar' }).click()
    await page.getByRole('button', { name: 'Archivar' }).waitFor(wait)
  })

  await step('Ajustes: guardar sin cambios (UPDATE real de settings)', async () => {
    await page.goto(`${BASE}/#/settings`)
    await page.getByLabel('Horas de impresión por día').waitFor(wait)
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.getByRole('status').getByText('Guardado').waitFor(wait)
  })

  await step('Dashboard muestra los trabajos y métricas', async () => {
    await page.goto(`${BASE}/#/`)
    await page.getByRole('heading', { name: new RegExp('\\[e2e\\]') }).first().waitFor(wait)
    await page.screenshot({ path: `${SHOTS}/03-dashboard-datos.png`, fullPage: true })
  })

  await step('Borrar ambos trabajos de prueba (cascada) y comprobar limpieza', async () => {
    for (let i = 0; i < 2; i++) {
      await page.goto(`${BASE}/#/jobs`)
      await page.getByLabel('Estado').selectOption('all')
      await page.getByLabel('Buscar trabajos').fill('[e2e]')
      await page.getByRole('heading', { name: new RegExp('\\[e2e\\]') }).first().click()
      await page.getByRole('button', { name: 'Eliminar trabajo' }).click()
      await dlg().getByRole('button', { name: 'Eliminar definitivamente' }).click()
      await page.getByRole('heading', { name: 'Trabajos', exact: true }).waitFor(wait)
    }
    await page.reload()
    await page.getByLabel('Estado').selectOption('all')
    await page.getByLabel('Buscar trabajos').fill('[e2e]')
    await page.waitForTimeout(800)
    if ((await page.getByRole('heading', { name: new RegExp('\\[e2e\\]') }).count()) !== 0) throw new Error('quedan trabajos [e2e]')
  })
} catch {
  console.log('\nVerificación interrumpida por un fallo; revisa test-results/real. Los datos [e2e] pueden haber quedado: bórralos desde la app.')
}

const bad = rest.filter((r) => r.status >= 400 && !(r.path.includes('/auth/v1/token') && r.status === 400))
console.log('\n=== RESUMEN ===')
for (const [n, ok, err] of results) console.log(ok ? 'PASS' : 'FAIL', n, err ?? '')
console.log(`Peticiones a Supabase: ${rest.length} · con error HTTP ≥400: ${bad.length}`)
for (const b of bad.slice(0, 10)) console.log('  ', b.method, b.path, b.status)
console.log('Tablas tocadas:', [...new Set(rest.filter((r) => r.path.startsWith('/rest/v1/')).map((r) => r.path.replace('/rest/v1/', '')))].join(', '))
await browser.close()
process.exit(results.some((r) => !r[1]) ? 1 : 0)
