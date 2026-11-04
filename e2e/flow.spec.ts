import { expect, test, type Page } from '@playwright/test'
import { FakeSupabase } from './fakeSupabase'

async function login(page: Page, api: FakeSupabase) {
  await api.install(page)
  await page.goto('/')
  await page.getByLabel('Correo').fill('yo@example.com')
  await page.getByLabel('Contraseña').fill('secreto')
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('flujo principal: encargo de 33 figuras con peanas', async ({ page }, info) => {
  const api = new FakeSupabase()
  await login(page, api)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('No hay trabajos activos')).toBeVisible()
  await page.screenshot({ path: `test-results/shots/${info.project.name}-01-dashboard-vacio.png` })

  // Crear el trabajo
  await page.getByRole('button', { name: 'Nuevo trabajo' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre', { exact: true }).fill('33 figuras personalizadas')
  await dialog.getByLabel('Cantidad de productos finales').fill('33')
  await dialog.getByLabel('Cliente (opcional)').fill('María')
  await dialog.getByRole('switch').click()
  await dialog.getByRole('button', { name: 'Crear trabajo' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '33 figuras personalizadas' })).toBeVisible()

  // Componente figura: 1 por tanda, 120 min
  await page.getByRole('button', { name: 'Añadir componente' }).click()
  await dialog.getByLabel('Nombre', { exact: true }).fill('Figura')
  await dialog.getByLabel('Tiempo por tanda (minutos)').fill('120')
  await expect(dialog.getByText('33 impresiones')).toBeVisible()
  await dialog.getByRole('button', { name: 'Añadir componente' }).click()
  await expect(page.getByRole('heading', { name: 'Figura', exact: true })).toBeVisible()

  // Componente peana: 4 por tanda
  await page.getByRole('button', { name: 'Componente', exact: true }).click()
  await dialog.getByLabel('Nombre', { exact: true }).fill('Peana')
  await dialog.getByLabel('Piezas que caben por tanda').fill('4')
  await dialog.getByLabel('Tiempo por tanda (minutos)').fill('90')
  await expect(dialog.getByText('9 impresiones')).toBeVisible() // ceil(33/4)
  await dialog.getByRole('button', { name: 'Añadir componente' }).click()
  await expect(page.getByRole('heading', { name: 'Peana', exact: true })).toBeVisible()
  await expect(page.getByText('42', { exact: true }).first()).toBeVisible() // 33 + 9 impresiones

  // Registrar 18 figuras vía "Ajustar…"
  await page.getByRole('button', { name: 'Ajustar…' }).first().click()
  await dialog.getByLabel(/Piezas completadas/).fill('18')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('15 de 33')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Progreso de Figura' })).toHaveAttribute('aria-valuenow', '55')

  // Sumar 1 con el botón rápido
  await page.getByRole('button', { name: 'Sumar una pieza a Figura' }).click()
  await expect(page.getByText('14 de 33')).toBeVisible()

  // Aviso al superar lo necesario
  await page.getByRole('button', { name: 'Ajustar…' }).first().click()
  await dialog.getByLabel(/Piezas completadas/).fill('40')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('supera')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()

  await page.screenshot({ path: `test-results/shots/${info.project.name}-02-detalle.png`, fullPage: true })

  // Dashboard con datos
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: '33 figuras personalizadas' }).first()).toBeVisible()
  await page.screenshot({ path: `test-results/shots/${info.project.name}-03-dashboard.png`, fullPage: true })

  // Recarga en una ruta profunda (HashRouter)
  await page.getByRole('heading', { name: '33 figuras personalizadas' }).first().click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Figura', exact: true })).toBeVisible()
})

test('cuenta no autorizada: se cierra sesión y no se ve contenido', async ({ page }) => {
  const api = new FakeSupabase()
  api.owner = false
  await login(page, api)
  await expect(page.getByRole('alert')).toContainText('no está autorizada')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0)
  expect(api.requests.some((r) => r.includes('/rest/v1/jobs'))).toBe(false)
})
