import { expect, test, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { writeFileSync } from 'node:fs'
import { FakeSupabase } from './fakeSupabase'
import { expectNoHorizontalOverflow } from './helpers'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const threeMf = (withThumb: boolean) =>
  Buffer.from(zipSync({ '3D/3dmodel.model': strToU8('<model/>'), ...(withThumb ? { 'Metadata/plate_1.png': new Uint8Array(PNG) } : {}) }))

async function login(page: Page, api: FakeSupabase) {
  await api.install(page)
  await page.goto('/')
  await page.getByLabel('Correo').fill('yo@example.com')
  await page.getByLabel('Contraseña').fill('secreto')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test('biblioteca, materiales, colores y costes', async ({ page }, info) => {
  const api = new FakeSupabase()
  await login(page, api)
  const dlg = page.getByRole('dialog')
  const nav = info.project.name === 'iphone' ? page.getByRole('navigation', { name: 'Principal' }).last() : page.getByRole('navigation', { name: 'Principal' }).first()

  // --- Material en Ajustes ---
  await nav.getByRole('link', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: 'Material', exact: true }).click()
  await dlg.getByLabel('Nombre', { exact: true }).fill('Verde esmeralda')
  await dlg.getByLabel('Precio por kg').fill('25')
  await dlg.getByRole('button', { name: 'Añadir material' }).click()
  await expect(page.getByText('Verde esmeralda')).toBeVisible()
  await dlg.getByLabel('Nombre').count() // diálogo cerrado
  // validación de color hex
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Material', exact: true }).click()
  await dlg.getByLabel('Nombre', { exact: true }).fill('Malo')
  await dlg.getByLabel('Color', { exact: true }).fill('verde')
  await dlg.getByRole('button', { name: 'Añadir material' }).click()
  await expect(dlg.getByText(/Color hexadecimal no válido/)).toBeVisible()
  await dlg.getByRole('button', { name: 'Cancelar' }).click()

  // --- Biblioteca: subir ---
  await nav.getByRole('link', { name: 'Biblioteca' }).click()
  await expect(page.getByText('Tu biblioteca está vacía')).toBeVisible()
  const input = page.getByLabel('Seleccionar archivos 3MF o STL').first()
  await input.setInputFiles([
    { name: 'Figura final.3mf', mimeType: 'application/octet-stream', buffer: threeMf(true) },
    { name: 'Peana.stl', mimeType: 'model/stl', buffer: Buffer.from('solid x\nendsolid x') },
  ])
  await expect(page.getByRole('button', { name: 'Abrir Figura final' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir Peana' })).toBeVisible()
  // sólo el 3MF con miniatura la muestra
  await expect(page.getByRole('img', { name: 'Miniatura de Figura final' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Miniatura de Peana' })).toHaveCount(0)
  expect([...api.objects.keys()].filter((k) => k.startsWith('files/')).length).toBe(2)
  expect([...api.objects.keys()].filter((k) => k.startsWith('thumbs/')).length).toBe(1)

  // 3MF sin miniatura: no se inventa nada
  await input.setInputFiles({ name: 'Sin vista.3mf', mimeType: 'application/octet-stream', buffer: threeMf(false) })
  await expect(page.getByRole('button', { name: 'Abrir Sin vista' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Miniatura de Sin vista' })).toHaveCount(0)

  // --- Errores claros ---
  await input.setInputFiles({ name: 'modelo.obj', mimeType: 'text/plain', buffer: Buffer.from('v 0 0 0') })
  await expect(page.getByRole('alert').getByText(/sólo se admiten archivos \.3mf y \.stl/)).toBeVisible()
  const big = info.outputPath('enorme.stl')
  writeFileSync(big, Buffer.alloc(50 * 1024 * 1024 + 1))
  await input.setInputFiles(big)
  await expect(page.getByRole('alert').getByText(/supera el límite de 50,0 MB/)).toBeVisible()
  expect(api.tables.model_files).toHaveLength(3)

  // --- Buscar y filtrar ---
  await page.getByLabel('Buscar modelos').fill('peana')
  await expect(page.getByRole('button', { name: 'Abrir Peana' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir Figura final' })).toHaveCount(0)
  await page.getByLabel('Buscar modelos').fill('')
  await page.getByLabel('Formato').selectOption('stl')
  await expect(page.getByRole('button', { name: 'Abrir Figura final' })).toHaveCount(0)
  await page.getByLabel('Formato').selectOption('')

  // --- Renombrar ---
  await page.getByRole('button', { name: 'Abrir Peana' }).click()
  await expect(dlg.getByText('Aún no se ha usado en ningún trabajo.')).toBeVisible()
  await dlg.getByLabel('Nombre del modelo').fill('Peana redonda')
  await dlg.getByRole('button', { name: 'Guardar nombre' }).click()
  await expect(dlg.getByText('Nombre actualizado')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Abrir Peana redonda' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // --- Trabajo con componente, color, consumo y archivo ---
  await nav.getByRole('link', { name: 'Trabajos' }).click()
  await page.getByRole('button', { name: 'Nuevo trabajo' }).first().click()
  await dlg.getByLabel('Nombre', { exact: true }).fill('10 figuras')
  await dlg.getByLabel('Cantidad de productos finales').fill('10')
  await dlg.getByRole('button', { name: 'Crear trabajo' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '10 figuras' })).toBeVisible()

  await page.getByRole('button', { name: 'Añadir componente' }).click()
  await dlg.getByLabel('Nombre', { exact: true }).fill('Figura')
  await dlg.getByLabel('Tiempo por tanda (minutos)').fill('60')
  await dlg.getByRole('button', { name: 'Añadir color' }).click()
  await dlg.getByLabel('Material').selectOption({ label: 'PLA · Verde esmeralda' })
  await dlg.getByLabel('g / tanda').fill('40')
  await dlg.getByLabel('Archivo del modelo (opcional)').selectOption({ label: 'Figura final (3MF)' })
  await dlg.getByRole('button', { name: 'Añadir componente' }).click()
  await expect(page.getByRole('heading', { name: 'Figura', exact: true })).toBeVisible()

  // 10 tandas × 40 g = 400 g → 10,00 € de filamento + 10 h × 0,1 kW × 0,20 € = 0,20 € → 10,20 €
  const calc = page.locator('section', { hasText: 'Cálculos' })
  await expect(calc.getByText('Filamento necesario')).toBeVisible()
  await expect(calc.getByText('400 g').first()).toBeVisible()
  await expect(calc.getByText(/10,00\s?€/).first()).toBeVisible()
  await expect(calc.getByText(/0,20\s?€/).first()).toBeVisible()
  await expect(calc.getByText(/10,20\s?€/).first()).toBeVisible()
  await expect(page.getByText('Verde esmeralda · 40 g/tanda')).toBeVisible()

  // El avance reduce el material pendiente (4 de 10 → quedan 240 g)
  await page.getByRole('button', { name: 'Ajustar…' }).first().click()
  await dlg.getByLabel(/Piezas completadas/).fill('4')
  await dlg.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(calc.getByText(/quedan 240 g/)).toBeVisible()

  // Archivo: descarga desde el componente y adjuntar desde la biblioteca
  await expect(page.getByRole('button', { name: 'Descargar Figura final.3mf' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'De la biblioteca' }).click()
  await dlg.getByRole('button', { name: /Peana redonda/ }).click()
  await expect(page.getByRole('heading', { name: 'Archivos' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Peana redonda' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quitar Peana redonda del trabajo' })).toBeVisible()
  await page.getByRole('button', { name: 'Quitar Peana redonda del trabajo' }).click()
  await expect(page.getByRole('link', { name: 'Peana redonda' })).toHaveCount(0)

  // Subir y adjuntar directamente desde el trabajo
  await page.getByLabel('Seleccionar archivos 3MF o STL').first().setInputFiles({ name: 'Extra.stl', mimeType: 'model/stl', buffer: Buffer.from('solid e\nendsolid e') })
  await expect(page.getByRole('link', { name: 'Extra' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // --- Biblioteca muestra dónde se usa y borrar conserva el componente ---
  await nav.getByRole('link', { name: 'Biblioteca' }).click()
  await page.getByRole('button', { name: 'Abrir Figura final' }).click()
  await expect(dlg.getByRole('link', { name: /10 figuras/ })).toBeVisible()
  await dlg.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Eliminar archivo' }).click()
  await expect(page.getByRole('button', { name: 'Abrir Figura final' })).toHaveCount(0)
  expect([...api.objects.keys()].some((k) => k.startsWith('thumbs/'))).toBe(false) // miniatura borrada con el modelo
  expect(api.tables.job_components![0]!.file_id).toBeNull()
  await page.screenshot({ path: `test-results/shots/${info.project.name}-04-biblioteca.png`, fullPage: true })
})
