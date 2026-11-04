import { expect, test } from '@playwright/test'

const GAMES = [
  { id: 'freecell', name: 'FreeCell', piles: 8 },
  { id: 'spider', name: 'Spider Solitär', piles: 10 },
] as const

for (const game of GAMES) {
  test(`${game.name}: fits the screen, gives hints, undoes and can be given up`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/#/games/${game.id}`)
    await page.getByRole('button', { name: /Spiel starten/ }).click()

    const piles = page.getByRole('group', { name: /^Reihe \d+$/ })
    await expect(piles).toHaveCount(game.piles)
    const viewport = page.viewportSize()!
    for (const pile of await piles.all()) {
      const box = (await pile.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    }
    expect(
      await page.evaluate(() => [
        document.documentElement.scrollWidth - window.innerWidth,
        document.documentElement.scrollHeight - window.innerHeight,
      ]),
    ).toEqual([0, 0])

    // The hint marks a card (or the stock); tapping the marked card plays it.
    await page.getByRole('button', { name: /Tipp/ }).click()
    const marked = page.locator('button:has(.animate-pulse)').first()
    await expect(marked).toBeVisible()
    if (isMobile) await marked.tap({ position: { x: 6, y: 8 } })
    else await marked.click({ position: { x: 6, y: 8 } })
    await expect(page.getByText(/Züge: [1-9]/)).toBeVisible()

    await page.getByRole('button', { name: 'Zug zurücknehmen' }).click()
    await expect(page.getByText(/Züge: 0/)).toBeVisible()

    await page.getByRole('button', { name: 'Aufgeben' }).click()
    await page.getByRole('button', { name: 'Ja' }).click()
    const dialog = page.getByRole('dialog', { name: 'Verloren' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Spielauswahl' }).click()
    await page.getByRole('link', { name: 'Statistik' }).click()
    await expect(page.getByRole('heading', { name: game.name, exact: true })).toBeVisible()
  })

  test(`${game.name}: rules can be read`, async ({ page }) => {
    await page.goto(`/#/games/${game.id}/rules`)
    await expect(page.getByRole('heading', { name: `Spielregeln: ${game.name}` })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Spielzüge' })).toBeVisible()
  })
}
