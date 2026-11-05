import { expect, type Page, test } from '@playwright/test'

test('Wizard: bid and play a short game of five rounds', async ({ page, isMobile }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { wizard: { opponents: 2, difficulty: 'beginner', options: { rounds: 'five' } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/wizard')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page.getByText(/Trumpf: /)).toBeVisible()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const next = page.getByRole('button', { name: 'Nächste Runde' })
  const bids = page.getByRole('group', { name: 'Ansage' }).locator('button:enabled')
  const trumps = page.getByRole('group', { name: 'Trumpf' }).getByRole('button')
  for (let step = 0; step < 600 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if (await next.isVisible()) await next.click()
    else if ((await trumps.count()) > 0) await trumps.first().click()
    else if ((await bids.count()) > 0) await bids.first().click()
    else if ((await card.count()) > 0) {
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
  await expect(gameOver).toContainText('Punkte')
})

test('Wizard rules can be read', async ({ page }) => {
  await page.goto('/#/games/wizard/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Wizard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wertung' })).toBeVisible()
})
