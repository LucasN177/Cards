import { expect, test } from '@playwright/test'

test('shows the game catalog', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Spielauswahl' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Deutsche Kartenspiele' })).toContainText('Skat')
})

test('navigates between pages and keeps settings after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await expect(page).toHaveURL(/#\/settings$/)

  await page.getByText('Dunkel', { exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('radio', { name: 'Dunkel' })).toBeChecked()

  await page.getByRole('link', { name: 'Spiele' }).click()
  await expect(page.getByRole('heading', { name: 'Spielauswahl' })).toBeVisible()
})

test('deep links work', async ({ page }) => {
  await page.goto('/#/games/schafkopf')
  await expect(page.getByRole('heading', { name: 'Schafkopf' })).toBeVisible()
  await expect(page.getByText(/bald spielbar/)).toBeVisible()
})
