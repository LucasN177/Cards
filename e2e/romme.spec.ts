import { expect, type Page, test } from '@playwright/test'

test('Rommé: draw, lay out when possible and discard through a round', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(300_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: {
            romme: { opponents: 1, difficulty: 'beginner', options: { rounds: 1, firstMeld: 30 } },
          },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/romme')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const stock = page.getByRole('button', { name: /^Stapel/ })
  const discardButton = page.getByRole('button', { name: /ablegen$/ })
  let discards = 0
  for (let step = 0; step < 1500 && !(await gameOver.isVisible()); step++) {
    if (await stock.isEnabled()) {
      await stock.click()
      continue
    }
    if (await discardButton.isVisible()) {
      await discardButton.click()
      discards++
      continue
    }
    // Select the last card in hand (jokers sit at the end, so take the first instead).
    const card = hand.locator('button[aria-disabled="false"]').first()
    if (
      (await card.count()) > 0 &&
      (await hand.locator('button[aria-pressed="true"]').count()) === 0
    )
      await tap(card)
    else await page.waitForTimeout(100)
  }
  await expect(gameOver).toBeVisible()
  expect(discards).toBeGreaterThan(0)
  await expect(gameOver).toContainText('Strafpunkte')
})

test('Rommé rules can be read', async ({ page }) => {
  await page.goto('/#/games/romme/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Rommé' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ein Zug' })).toBeVisible()
})
