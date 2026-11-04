import { expect, test } from '@playwright/test'

test('plays a full game of Crazy Eights', async ({ page, isMobile }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { 'crazy-eights': { opponents: 1, difficulty: 'beginner' } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/crazy-eights')
  await expect(page.getByRole('switch', { name: 'Ziehen, bis es passt' })).toBeChecked()
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const wish = page.getByRole('dialog', { name: 'Welche Farbe wünschst du dir?' })
  const playable = page
    .getByRole('group', { name: 'Deine Karten' })
    .locator('button[aria-disabled="false"]')
  const pass = page.getByRole('button', { name: 'Weiter' })
  const draw = page.getByRole('button', { name: /Ziehen|Karten ziehen/ })
  const corner = { position: { x: 8, y: 12 } }

  for (let step = 0; step < 400 && !(await gameOver.isVisible()); step++) {
    if (await wish.isVisible()) {
      await wish.getByRole('button').first().click()
    } else if ((await playable.count()) > 0) {
      const card = playable.first()
      if (isMobile) {
        await card.tap(corner)
        if ((await card.count()) > 0 && (await card.getAttribute('aria-pressed')) === 'true') {
          await card.tap(corner)
        }
      } else await card.click()
    } else if (await pass.isVisible()) await pass.click()
    else if (await draw.isVisible()) await draw.click()
    else await page.waitForTimeout(150)
  }
  await expect(gameOver).toContainText('Strafpunkte')
})

test('Crazy Eights rules can be read', async ({ page }) => {
  await page.goto('/#/games/crazy-eights/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Crazy Eights' })).toBeVisible()
  await expect(page.getByText(/Die 8 ist wild/)).toBeVisible()
})
