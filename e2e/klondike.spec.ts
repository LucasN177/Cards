import { expect, test } from '@playwright/test'

test('Solitaire fits the screen and can be played, undone and given up', async ({
  page,
  isMobile,
}) => {
  await page.goto('/#/games/klondike')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  // Seven piles, all inside the viewport, no scrolling.
  const piles = page.getByRole('group', { name: /^Reihe \d$/ })
  await expect(piles).toHaveCount(7)
  const viewport = page.viewportSize()!
  for (const pile of await piles.all()) {
    const box = (await pile.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  }
  const overflow = await page.evaluate(() => [
    document.documentElement.scrollWidth - window.innerWidth,
    document.documentElement.scrollHeight - window.innerHeight,
  ])
  expect(overflow).toEqual([0, 0])

  // Turn a card from the stock (tap on phones), then take it back.
  const stock = page.getByRole('button', { name: /Stapel: 24 Karten/ })
  if (isMobile) await stock.tap()
  else await stock.click()
  await expect(page.getByRole('button', { name: /Stapel: 23 Karten/ })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Ablage' }).getByRole('button')).toHaveCount(1)
  await page.getByRole('button', { name: 'Zug zurücknehmen' }).click()
  await expect(page.getByRole('button', { name: /Stapel: 24 Karten/ })).toBeVisible()

  // Give up: counts as a loss and shows up in the statistics.
  await page.getByRole('button', { name: 'Aufgeben' }).click()
  await page.getByRole('button', { name: 'Ja' }).click()
  const dialog = page.getByRole('dialog', { name: 'Verloren' })
  await expect(dialog).toContainText('Abgelegte Karten')
  await dialog.getByRole('button', { name: 'Spielauswahl' }).click()
  await page.getByRole('link', { name: 'Statistik' }).click()
  await expect(page.getByRole('heading', { name: 'Solitär', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Nach Stärke der Gegner' })).toHaveCount(0)
})

test('Solitaire rules can be read', async ({ page }) => {
  await page.goto('/#/games/klondike/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Solitär' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Spielzüge' })).toBeVisible()
})
