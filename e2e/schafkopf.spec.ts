import { expect, type Page, test } from '@playwright/test'

test('Schafkopf: announce a game and play four games', async ({ page, isMobile }) => {
  test.setTimeout(240_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { schafkopf: { opponents: 3, difficulty: 'beginner', options: { games: 4 } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/schafkopf')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const next = page.getByRole('button', { name: 'Nächstes Spiel' })
  const pass = page.getByRole('button', { name: 'Weiter' })
  const soloMenu = page.getByRole('button', { name: 'Solo …' })
  const soloChoice = page
    .getByRole('group', { name: 'Solo wählen' })
    .getByRole('button', { name: /-Solo$/ })
  let announced = false
  for (let step = 0; step < 800 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if (await next.isVisible()) await next.click()
    else if (await pass.isVisible()) {
      // Play a solo the first time it is possible (always allowed unless outbid), then pass.
      if (!announced && (await soloMenu.isVisible())) {
        await soloMenu.click()
        await soloChoice.first().click()
        announced = true
      } else await pass.click()
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
  expect(announced).toBe(true)
  await expect(gameOver).toContainText('Punkte')
})

test('Schafkopf rules can be read', async ({ page }) => {
  await page.goto('/#/games/schafkopf/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Schafkopf' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wertung (Tarif)' })).toBeVisible()
})
