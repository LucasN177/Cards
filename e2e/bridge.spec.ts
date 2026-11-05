import { expect, type Page, test } from '@playwright/test'

test('Bridge: bid and play a Chicago of four deals', async ({ page, isMobile }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { bridge: { opponents: 3, difficulty: 'beginner', options: { deals: 4 } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/bridge')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const dummy = page.getByRole('group', { name: 'Karten des Dummys' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const next = page.getByRole('button', { name: 'Nächste Austeilung' })
  const box = page.getByRole('group', { name: 'Bietbox' })
  let bid = false
  for (let step = 0; step < 1500 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    const dummyCard = dummy.locator('button:enabled').first()
    if (await next.isVisible()) await next.click()
    else if (await box.isVisible()) {
      // Bid once with the lowest possible bid to check the bidding box, otherwise pass.
      const level = box.locator('button:enabled', { hasText: /^[1-7]$/ }).first()
      if (!bid && (await level.count()) > 0) {
        await level.click()
        await box
          .locator('button:enabled', { hasText: /^[1-7].+/ })
          .first()
          .click()
        bid = true
      } else await box.getByRole('button', { name: 'Passe' }).click()
    } else if ((await dummyCard.count()) > 0) await dummyCard.click()
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
  expect(bid).toBe(true)
  await expect(gameOver).toContainText('Punkte')
})

test('Bridge rules can be read', async ({ page }) => {
  await page.goto('/#/games/bridge/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Bridge' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reizung' })).toBeVisible()
})
