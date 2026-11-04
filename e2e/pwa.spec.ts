import { expect, test } from '@playwright/test'

test.describe('PWA', () => {
  test('exposes a web manifest', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBeTruthy()

    const manifest = await (await request.get(href!)).json()
    expect(manifest.name).toBe('Cards')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)
  })

  test('works offline after the service worker is installed', async ({ page, context }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await expect(page.getByRole('status')).toContainText('offline verfügbar')

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Spielauswahl' })).toBeVisible()
  })
})
