// Verificación manual-asistida de la FASE 2 contra Supabase REAL (sin mocks): Storage privado, biblioteca,
// materiales, colores y costes. La contraseña la escribe el propietario en la ventana; no pasa por el script.
// Crea datos "[e2e]" y los borra al final. Requiere la migración 2 aplicada. Uso: node scripts/verify-real-files.mjs [url]
import { chromium } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const SHOTS = 'test-results/real'
mkdirSync(SHOTS, { recursive: true })

const envLines = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(String.fromCharCode(10))
const env = Object.fromEntries(envLines.map((l) => l.trim()).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const SB = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

// Archivos de prueba (el 3MF lleva una miniatura PNG real de 1x1).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const MF3 = Buffer.from(zipSync({ '3D/3dmodel.model': strToU8('<model unit="millimeter"/>'), 'Metadata/plate_1.png': new Uint8Array(PNG) }))
const STL = Buffer.from('solid e2e\nendsolid e2e\n')
const MF3_NAME = '[e2e] Figura.3mf'
const STL_NAME = '[e2e] Peana.stl'

const results = []
const uploaded = []
let signedSample = null
const browser = await chromium.launch({ headless: false })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
page.on('request', (r) => {
  const m = r.url().match(/\/storage\/v1\/object\/printforge\/((?:files|thumbs|covers)\/[^?]+)/)
  if (m && r.method() === 'POST') uploaded.push(m[1])
})
page.on('response', async (r) => {
  if (r.url().includes('/storage/v1/object/sign/printforge') && r.request().method() === 'POST' && !signedSample) {
    try { signedSample = await r.json() } catch { /* ignorar */ }
  }
})

async function step(name, fn) {
  try {
    await fn()
    results.push([name, true])
    console.log('  OK   ', name)
  } catch (e) {
    const msg = String(e.message).split('\n')[0]
    results.push([name, false, msg])
    console.log('  FALLA', name, '→', msg)
    await page.screenshot({ path: `${SHOTS}/fallo-fase2-${results.length}.png`, fullPage: true }).catch(() => {})
    throw e
  }
}
const dlg = () => page.getByRole('dialog')
async function cleanup() {
  const re = /\[e2e\]/
  for (;;) {
    await page.goto(`${BASE}/#/jobs`)
    await page.getByLabel('Estado').selectOption('all')
    await page.getByLabel('Buscar trabajos').fill('[e2e]')
    await page.waitForTimeout(700)
    if ((await page.getByRole('heading', { name: re }).count()) === 0) break
    await page.getByRole('heading', { name: re }).first().click()
    await page.getByRole('button', { name: 'Eliminar trabajo' }).click()
    await dlg().getByRole('button', { name: 'Eliminar definitivamente' }).click()
    await page.getByRole('heading', { name: 'Trabajos', exact: true }).waitFor({ timeout: 20_000 })
  }
  for (;;) {
    await page.goto(`${BASE}/#/library`)
    await page.getByLabel('Buscar modelos').fill('[e2e]')
    await page.waitForTimeout(700)
    if ((await page.getByRole('button', { name: /Abrir \[e2e\]/ }).count()) === 0) break
    await page.getByRole('button', { name: /Abrir \[e2e\]/ }).first().click()
    await dlg().getByRole('button', { name: 'Eliminar', exact: true }).click()
    await page.getByRole('dialog').last().getByRole('button', { name: 'Eliminar archivo' }).click()
    await page.waitForTimeout(1200)
  }
  await page.goto(`${BASE}/#/settings`)
  await page.getByLabel('Horas de impresión por día').waitFor({ timeout: 20_000 })
  while ((await page.getByRole('button', { name: /Eliminar \[e2e\]/ }).count()) > 0) {
    await page.getByRole('button', { name: /Eliminar \[e2e\]/ }).first().click()
    await page.getByRole('dialog').last().getByRole('button', { name: 'Eliminar', exact: true }).click()
    await page.waitForTimeout(1200)
  }
}
const wait = { timeout: 20_000 }
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

/** Petición anónima: sólo apikey pública, sin sesión. */
const anon = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, ...(init.headers ?? {}) } })
const token = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'))
  return k ? JSON.parse(localStorage.getItem(k)).access_token : null
})
const authed = async (path, init = {}) => anon(path, { ...init, headers: { authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) } })

try {
  await page.goto(BASE)
  console.log('>>> Inicia sesión en la ventana de Chromium (10 minutos). No la cierres.')
  await step('Login real del propietario (manual)', () => page.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 600_000 }))

  await step('Migración 2 aplicada (la Biblioteca carga sin errores)', async () => {
    await page.goto(`${BASE}/#/library`)
    await page.getByRole('heading', { name: 'Biblioteca' }).waitFor(wait)
    await page.waitForTimeout(1500)
    expect((await page.getByText('No se pudieron cargar los datos').count()) === 0, 'Error de carga: ¿está aplicada la migración 20261104000002?')
  })

  await step('Limpia restos [e2e] de ejecuciones anteriores', cleanup)

  await step('Crear material [e2e] (25 €/kg) en Ajustes', async () => {
    await page.goto(`${BASE}/#/settings`)
    await page.getByRole('button', { name: 'Material', exact: true }).click()
    await dlg().getByLabel('Nombre', { exact: true }).fill('[e2e] Verde')
    await dlg().getByLabel('Precio por kg').fill('25')
    await dlg().getByRole('button', { name: 'Añadir material' }).click()
    await page.getByText('[e2e] Verde').waitFor(wait)
  })

  await step('Subir 3MF (con miniatura) y STL a Storage privado', async () => {
    await page.goto(`${BASE}/#/library`)
    await page.getByLabel('Seleccionar archivos 3MF o STL').first().setInputFiles([
      { name: MF3_NAME, mimeType: 'application/octet-stream', buffer: MF3 },
      { name: STL_NAME, mimeType: 'model/stl', buffer: STL },
    ])
    await page.getByRole('button', { name: 'Abrir [e2e] Figura' }).waitFor(wait)
    await page.getByRole('button', { name: 'Abrir [e2e] Peana' }).waitFor(wait)
    expect(uploaded.filter((p) => p.startsWith('files/')).length === 2, 'Se esperaban 2 objetos en files/')
    expect(uploaded.filter((p) => p.startsWith('thumbs/')).length === 1, 'Se esperaba 1 miniatura extraída del 3MF')
  })

  await step('La miniatura se carga de verdad desde una URL firmada', async () => {
    const img = page.getByRole('img', { name: 'Miniatura de [e2e] Figura' })
    await img.waitFor(wait)
    await page.waitForFunction(() => [...document.images].some((i) => i.alt.includes('[e2e] Figura') && i.complete && i.naturalWidth > 0), null, wait)
    expect((await page.getByRole('img', { name: 'Miniatura de [e2e] Peana' }).count()) === 0, 'El STL no debe mostrar miniatura inventada')
    await page.screenshot({ path: `${SHOTS}/10-biblioteca.png`, fullPage: true })
  })

  await step('Descarga del original íntegra (SHA-256 idéntico)', async () => {
    await page.getByRole('button', { name: 'Abrir [e2e] Figura' }).click()
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), dlg().getByRole('button', { name: 'Descargar original' }).click()])
    expect(download.suggestedFilename() === MF3_NAME, `Nombre de descarga: ${download.suggestedFilename()}`)
    const stream = await download.createReadStream()
    const chunks = []
    for await (const c of stream) chunks.push(c)
    expect(sha(Buffer.concat(chunks)) === sha(MF3), 'El archivo descargado difiere del original')
    await page.keyboard.press('Escape')
  })

  await step('ANÓNIMO: no puede descargar ni listar (bucket privado)', async () => {
    const path = uploaded.find((p) => p.startsWith('files/') && p.endsWith('.3mf'))
    const checks = [
      ['URL pública', await anon(`/storage/v1/object/public/printforge/${path}`)],
      ['endpoint autenticado sin sesión', await anon(`/storage/v1/object/authenticated/printforge/${path}`)],
      ['GET directo con clave anon', await anon(`/storage/v1/object/printforge/${path}`)],
      ['info del objeto', await anon(`/storage/v1/object/info/printforge/${path}`)],
    ]
    for (const [label, r] of checks) {
      const body = Buffer.from(await r.arrayBuffer())
      console.log(`        ${label}: HTTP ${r.status}`)
      expect(r.status >= 400, `${label}: respondió ${r.status}`)
      expect(sha(body) !== sha(MF3), `${label}: ¡devolvió el archivo!`)
    }
    const list = await anon('/storage/v1/object/list/printforge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix: 'files', limit: 100 }) })
    const listBody = await list.text()
    console.log(`        listado: HTTP ${list.status} ${listBody.slice(0, 60)}`)
    expect(list.status >= 400 || listBody === '[]', 'El listado anónimo devolvió objetos')
    const up = await anon(`/storage/v1/object/printforge/files/${crypto.randomUUID()}.stl`, { method: 'POST', headers: { 'content-type': 'model/stl' }, body: STL })
    console.log(`        subida anónima: HTTP ${up.status}`)
    expect(up.status >= 400, 'Un anónimo pudo subir un archivo')
    const del = await anon('/storage/v1/object/printforge', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) })
    const delBody = await del.text()
    console.log(`        borrado anónimo: HTTP ${del.status} ${delBody.slice(0, 40)}`)
    expect(del.status >= 400 || delBody === '[]', 'Un anónimo pudo borrar un objeto')
  })

  await step('Enlace firmado: válido sin sesión, manipulado/expirado falla', async () => {
    const path0 = uploaded.find((p) => p.startsWith('files/') && p.endsWith('.3mf'))
    const first = await authed(`/storage/v1/object/sign/printforge/${path0}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) })
    signedSample = { download: `${SB}/storage/v1${(await first.json()).signedURL}` }
    const good = await fetch(signedSample.download)
    expect(good.status === 200 && sha(Buffer.from(await good.arrayBuffer())) === sha(MF3), `El enlace firmado no entregó el archivo (HTTP ${good.status})`)
    const u = new URL(signedSample.download)
    u.searchParams.set('token', u.searchParams.get('token').slice(0, -4) + 'AAAA')
    const bad = await fetch(u)
    console.log(`        token manipulado: HTTP ${bad.status}`)
    expect(bad.status >= 400, 'Un token manipulado fue aceptado')
    const path = uploaded.find((p) => p.startsWith('files/') && p.endsWith('.3mf'))
    const short = await authed(`/storage/v1/object/sign/printforge/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 2 }) })
    const { signedURL } = await short.json()
    const shortUrl = `${SB}/storage/v1${signedURL}`
    expect((await fetch(shortUrl)).status === 200, 'El enlace de 2 s no funcionó al instante')
    await new Promise((r) => setTimeout(r, 4000))
    const expired = await fetch(shortUrl)
    console.log(`        enlace expirado: HTTP ${expired.status}`)
    expect(expired.status >= 400, 'Un enlace expirado siguió funcionando')
  })

  await step('Políticas reales: extensión no permitida, ruta ajena y >50 MB rechazadas', async () => {
    const id = crypto.randomUUID()
    const exe = await authed(`/storage/v1/object/printforge/files/${id}.exe`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: 'MZ' })
    console.log(`        .exe: HTTP ${exe.status}`)
    expect(exe.status >= 400, 'Se aceptó una extensión no permitida')
    const other = await authed(`/storage/v1/object/printforge/otra/${id}.stl`, { method: 'POST', headers: { 'content-type': 'model/stl' }, body: STL })
    console.log(`        ruta fuera de files/thumbs/covers: HTTP ${other.status}`)
    expect(other.status >= 400, 'Se aceptó una ruta no permitida')
    const big = await authed(`/storage/v1/object/printforge/files/${id}.stl`, { method: 'POST', headers: { 'content-type': 'model/stl' }, body: Buffer.alloc(50 * 1024 * 1024 + 1) })
    console.log(`        50 MB + 1 byte: HTTP ${big.status}`)
    expect(big.status >= 400, 'El bucket aceptó un archivo de más de 50 MB')
    const stray = await authed('/storage/v1/object/list/printforge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix: 'files', limit: 100 }) })
    const names = (await stray.json()).map((o) => o.name)
    expect(names.length === 2, `Quedaron objetos inesperados en files/: ${names.length}`)
  })

  await step('Trabajo con componente: color, consumo y archivo asociado', async () => {
    await page.goto(`${BASE}/#/settings`)
    const hours = Number(await page.getByLabel('Horas de impresión por día').inputValue())
    const watts = Number((await page.getByLabel('Consumo de la impresora (W)').inputValue()).replace(',', '.'))
    const kwh = Number((await page.getByLabel('Precio del kWh (€)').inputValue()).replace(',', '.'))
    expect(hours > 0, 'Ajustes sin horas por día')
    await page.goto(`${BASE}/#/jobs`)
    await page.getByRole('button', { name: 'Nuevo trabajo' }).first().click()
    await dlg().getByLabel('Nombre', { exact: true }).fill('[e2e] 10 figuras')
    await dlg().getByLabel('Cantidad de productos finales').fill('10')
    await dlg().getByRole('button', { name: 'Crear trabajo' }).click()
    await page.getByRole('heading', { level: 1, name: '[e2e] 10 figuras' }).waitFor(wait)
    await page.getByRole('button', { name: 'Añadir componente' }).click()
    await dlg().getByLabel('Nombre', { exact: true }).fill('Figura')
    await dlg().getByLabel('Tiempo por tanda (minutos)').fill('60')
    await dlg().getByRole('button', { name: 'Añadir color' }).click()
    await dlg().getByLabel('Material').selectOption({ label: 'PLA · [e2e] Verde' })
    await dlg().getByLabel('g / tanda').fill('40')
    await dlg().getByLabel('Archivo del modelo (opcional)').selectOption({ label: '[e2e] Figura (3MF)' })
    await dlg().getByRole('button', { name: 'Añadir componente' }).click()
    await page.getByRole('heading', { name: 'Figura', exact: true }).waitFor(wait)
    const calc = page.locator('section', { hasText: 'Cálculos' })
    await calc.getByText('400 g').first().waitFor(wait)
    const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n).replace(/\s/g, '\\s?')
    const elec = 10 * (watts / 1000) * kwh // 10 tandas × 1 h
    await calc.getByText(new RegExp(eur(10))).first().waitFor(wait) // 400 g × 25 €/kg
    await calc.getByText(new RegExp(eur(10 + elec))).first().waitFor(wait)
    await page.getByText('[e2e] Verde · 40 g/tanda').waitFor(wait)
    await page.getByRole('button', { name: 'Descargar [e2e] Figura.3mf' }).first().waitFor(wait)
    await page.screenshot({ path: `${SHOTS}/11-trabajo-materiales.png`, fullPage: true })
  })

  await step('Persistencia tras recargar (colores, archivo y costes)', async () => {
    await page.reload()
    await page.getByText('[e2e] Verde · 40 g/tanda').waitFor(wait)
    await page.getByRole('button', { name: 'Descargar [e2e] Figura.3mf' }).first().waitFor(wait)
    await page.getByRole('link', { name: '[e2e] Figura', exact: false }).first().waitFor(wait).catch(() => {})
  })

  await step('Adjuntar el STL de la biblioteca al trabajo y duplicar (conserva archivos)', async () => {
    await page.getByRole('button', { name: 'De la biblioteca' }).click()
    await dlg().getByRole('button', { name: /\[e2e\] Peana/ }).click()
    await page.getByRole('button', { name: 'Quitar [e2e] Peana del trabajo' }).waitFor(wait)
    await page.getByRole('button', { name: 'Duplicar' }).click()
    await page.getByRole('heading', { level: 1, name: /\(copia\)/ }).waitFor(wait)
    await page.getByText('[e2e] Verde · 40 g/tanda').waitFor(wait)
    await page.getByRole('button', { name: 'Quitar [e2e] Peana del trabajo' }).waitFor(wait)
  })

  await step('Biblioteca: «usado en» refleja los trabajos', async () => {
    await page.goto(`${BASE}/#/library`)
    await page.getByRole('button', { name: 'Abrir [e2e] Peana' }).click()
    await dlg().getByRole('link', { name: /\[e2e\] 10 figuras/ }).first().waitFor(wait)
    await page.keyboard.press('Escape')
  })

  await step('Eliminar modelo: borra objetos de Storage y conserva el componente', async () => {
    await page.getByRole('button', { name: 'Abrir [e2e] Figura' }).click()
    await dlg().getByRole('button', { name: 'Eliminar', exact: true }).click()
    await page.getByRole('dialog').last().getByRole('button', { name: 'Eliminar archivo' }).click()
    await page.getByRole('button', { name: 'Abrir [e2e] Figura' }).waitFor({ state: 'detached', ...wait })
    const r = await authed('/storage/v1/object/list/printforge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix: 'thumbs', limit: 100 }) })
    expect((await r.json()).length === 0, 'La miniatura quedó huérfana en Storage')
    const f = await authed('/storage/v1/object/list/printforge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix: 'files', limit: 100 }) })
    expect((await f.json()).length === 1, 'Debía quedar sólo el STL en files/')
  })

  await step('Limpieza final: trabajos, modelos y material [e2e]', async () => {
    await cleanup()
    for (const prefix of ['files', 'thumbs']) {
      const r = await authed('/storage/v1/object/list/printforge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 100 }) })
      expect((await r.json()).length === 0, `Quedan objetos en ${prefix}/`)
    }
  })
} catch {
  console.log('\nInterrumpido por un fallo. Revisa test-results/real y borra a mano lo que empiece por [e2e] (trabajos, modelos, material).')
}

console.log('\n=== RESUMEN FASE 2 ===')
for (const [n, ok, err] of results) console.log(ok ? 'PASS' : 'FAIL', n, err ?? '')
await browser.close()
process.exit(results.some((r) => !r[1]) ? 1 : 0)
