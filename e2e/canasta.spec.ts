import { expect, test } from '@playwright/test'

test('Canasta: a whole hand with four players through the table', async ({ page, isMobile }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { canasta: { opponents: 3, difficulty: 'beginner', options: { targetScore: 0 } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/canasta')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page.getByRole('region', { name: /Meldungen: Ihr/ })).toBeVisible()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const stock = page.getByRole('button', { name: /^Stapel/ })
  const discard = page.getByRole('button', { name: /ablegen$/ })
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  let discards = 0
  for (let step = 0; step < 3000 && !(await gameOver.isVisible()); step++) {
    if (await stock.isEnabled()) await stock.click()
    else if ((await discard.isVisible()) && (await discard.isEnabled())) {
      await discard.click()
      discards++
    } else {
      const selected = hand.locator('button[aria-pressed="true"]')
      if ((await selected.count()) > 0) {
        // The chosen card may not be thrown (e.g. the last card): choose another one.
        await selected.first().click({ position: { x: 8, y: 12 } })
        continue
      }
      const cards = hand.locator('button[aria-disabled="false"]')
      const count = await cards.count()
      if (count === 0) {
        await page.waitForTimeout(100)
        continue
      }
      const card = cards.nth(step % count)
      if (isMobile) await card.tap({ position: { x: 8, y: 12 } })
      else await card.click({ position: { x: 8, y: 12 } })
    }
  }
  await expect(gameOver).toBeVisible()
  expect(discards).toBeGreaterThan(0)
})

test('Canasta rules can be read', async ({ page }) => {
  await page.goto('/#/games/canasta/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Canasta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ausmachen und Wertung' })).toBeVisible()
})
