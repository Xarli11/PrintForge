import { expect, type Page } from '@playwright/test'

/** Un desbordamiento horizontal hace que iOS reduzca el zoom de toda la página: se vigila en cada pantalla. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth, vv } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, vv: window.visualViewport?.width ?? window.innerWidth }))
  expect(scrollWidth, 'scrollWidth > ancho de ventana').toBeLessThanOrEqual(innerWidth)
  expect(Math.round(vv), 'zoom distinto de 1').toBe(innerWidth)
}
