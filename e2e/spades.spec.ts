import { expect, type Page, test } from '@playwright/test'

test('Spades: bid and play a whole hand with a partner', async ({ page, isMobile }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { spades: { opponents: 3, difficulty: 'beginner', options: { targetScore: 0 } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/spades')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  await page.getByRole('button', { name: '3 ansagen', exact: true }).click()
  await expect(page.getByText(/Du: 3 \//)).toBeVisible()
  await expect(page.getByRole('region', { name: /\(Partner\)/ })).toBeVisible()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  for (let step = 0; step < 200 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if ((await card.count()) > 0) {
      await tap(card)
      if (
        isMobile &&
        (await card.count()) > 0 &&
        (await card.getAttribute('aria-pressed')) === 'true'
      )
        await tap(card)
    } else await page.waitForTimeout(100)
  }
  await expect(gameOver).toBeVisible()
  await expect(gameOver).toContainText('Teampunkte')
})

test('Spades rules can be read', async ({ page }) => {
  await page.goto('/#/games/spades/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Spades' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wertung' })).toBeVisible()
})
