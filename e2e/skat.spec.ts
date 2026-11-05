import { expect, type Page, test } from '@playwright/test'

test('Skat: three games with bidding, Skat, discarding and declaring when the bid is won', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { skat: { opponents: 2, difficulty: 'beginner', options: { games: 3 } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/skat')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const next = page.getByRole('button', { name: 'Nächstes Spiel' })
  const button = (name: RegExp) => page.getByRole('button', { name })
  const declare = page.getByRole('group', { name: 'Spiel ansagen' }).getByRole('button')
  let declared = false
  for (let step = 0; step < 800 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if (await next.isVisible()) await next.click()
    // Until a game is declared, outbid everybody (up to 72) and always hold; then just pass.
    else if (await button(/^Reizen/).isVisible()) {
      const value = Number(((await button(/^Reizen/).textContent()) ?? '').replace(/\D/g, ''))
      await (!declared && value <= 72 ? button(/^Reizen/) : button(/^Passe$/)).click()
    } else if (await button(/^Ja \(/).isVisible())
      await (declared ? button(/^Passe$/) : button(/^Ja \(/)).click()
    else if (await button(/^Spielen \(18\)$/).isVisible()) await button(/^Spielen \(18\)$/).click()
    else if (await button(/^Skat aufnehmen$/).isVisible()) await button(/^Skat aufnehmen$/).click()
    else if (await button(/^Drücken/).isVisible()) {
      await tap(hand.getByRole('button').nth(0))
      await tap(hand.getByRole('button').nth(1))
      await button(/^Drücken/).click()
    } else if ((await declare.count()) > 0 && (await declare.first().isVisible())) {
      await page.getByRole('button', { name: /^Grand ansagen/ }).click()
      declared = true
    } else if ((await card.count()) > 0) {
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
  expect(declared).toBe(true)
  await expect(gameOver).toContainText('Punkte')
})

test('Skat rules can be read', async ({ page }) => {
  await page.goto('/#/games/skat/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Skat' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Spielwert' })).toBeVisible()
})
