import { expect, type Page, test } from '@playwright/test'

test('Durak: attack, defend or take until the game is decided', async ({ page, isMobile }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { durak: { opponents: 1, difficulty: 'beginner', options: {} } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/durak')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page.getByText(/Trumpf (Kreuz|Pik|Herz|Karo)/)).toBeVisible()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const play = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) {
      await locator.tap({ position: { x: 8, y: 12 } })
      if ((await locator.count()) > 0 && (await locator.getAttribute('aria-pressed')) === 'true')
        await locator.tap({ position: { x: 8, y: 12 } })
    } else await locator.click({ position: { x: 8, y: 12 } })
  }

  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const take = page.getByRole('button', { name: 'Aufnehmen' })
  const done = page.getByRole('button', { name: 'Fertig' })
  for (let step = 0; step < 400 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if ((await card.count()) > 0 && !(await done.isVisible())) await play(card)
    else if (await done.isVisible()) await done.click()
    else if (await take.isVisible()) await take.click()
    else await page.waitForTimeout(100)
  }
  await expect(gameOver).toBeVisible()
})

test('Durak rules can be read', async ({ page }) => {
  await page.goto('/#/games/durak/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Durak' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Angriff und Verteidigung' })).toBeVisible()
})
