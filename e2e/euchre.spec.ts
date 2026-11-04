import { expect, type Page, test } from '@playwright/test'

test('Euchre: name trump and play hands to five points', async ({ page, isMobile }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { euchre: { opponents: 3, difficulty: 'beginner', options: { target: 5 } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/euchre')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const next = page.getByRole('button', { name: 'Nächste Hand' })
  const order = page.getByRole('button', { name: /^(Bestellen|Aufnehmen)$/ })
  const suit = page.getByRole('button', { name: /^(Kreuz|Pik|Herz|Karo)$/ })
  for (let step = 0; step < 600 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if (await next.isVisible()) await next.click()
    else if (await order.isVisible()) await order.click()
    else if ((await suit.count()) > 0 && (await suit.first().isVisible()))
      await suit.first().click()
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
  await expect(gameOver).toContainText('Teampunkte')
})

test('Euchre rules can be read', async ({ page }) => {
  await page.goto('/#/games/euchre/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Euchre' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Karten und Buben' })).toBeVisible()
})
