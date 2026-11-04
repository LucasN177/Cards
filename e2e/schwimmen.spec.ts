import { expect, type Page, test } from '@playwright/test'

test('Schwimmen: swap a card, knock and play until the game is decided', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { schwimmen: { opponents: 1, difficulty: 'beginner', options: { lives: 2 } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/schwimmen')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const middle = page.getByRole('group', { name: 'Karten in der Mitte' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }

  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  let swapped = false
  for (let step = 0; step < 300 && !(await gameOver.isVisible()); step++) {
    const knock = page.getByRole('button', { name: 'Klopfen' })
    const pass = page.getByRole('button', { name: 'Schieben' })
    const next = page.getByRole('button', { name: 'Nächste Runde' })
    if (await next.isVisible()) await next.click()
    else if (!swapped && (await pass.isVisible())) {
      // Choose a hand card, then take a card from the middle.
      await tap(hand.getByRole('button').first())
      await expect(page.getByText('Tippe eine Karte in der Mitte zum Tauschen')).toBeVisible()
      await middle.getByRole('button').first().click()
      swapped = true
    } else if (await knock.isVisible()) await knock.click()
    else if (await pass.isVisible()) await pass.click()
    else await page.waitForTimeout(100)
  }
  expect(swapped).toBe(true)
  await expect(gameOver).toBeVisible()
  await expect(gameOver).toContainText('Leben')
})

test('Schwimmen rules can be read', async ({ page }) => {
  await page.goto('/#/games/schwimmen/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Schwimmen (31)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Leben und Schwimmen' })).toBeVisible()
})
