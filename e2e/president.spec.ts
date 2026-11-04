import { expect, type Page, test } from '@playwright/test'

test('President: play rounds with the card exchange until the game ends', async ({
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
          games: {
            president: { opponents: 2, difficulty: 'beginner', options: { rounds: 3 } },
          },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/president')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }

  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const legen = page.getByRole('button', { name: /^Legen/ })
  const passen = page.getByRole('button', { name: 'Passen' })
  const abgeben = page.getByRole('button', { name: /^Abgeben/ })
  const next = page.getByRole('button', { name: 'Nächste Runde' })
  for (let step = 0; step < 1000 && !(await gameOver.isVisible()); step++) {
    if (await next.isVisible()) await next.click()
    else if (await abgeben.isVisible()) {
      await tap(hand.getByRole('button').nth(0))
      await tap(hand.getByRole('button').nth(1))
      await abgeben.click()
    } else if (await legen.isVisible()) {
      // The weakest allowed card; pass if it does not fit (e.g. a pair is needed).
      const playable = hand.locator('button[aria-disabled="false"]').first()
      const selected = hand.locator('button[aria-pressed="true"]')
      if ((await selected.count()) === 0 && (await playable.count()) > 0) await tap(playable)
      if (await legen.isEnabled()) await legen.click()
      else if (await passen.isVisible()) await passen.click()
    } else await page.waitForTimeout(100)
  }
  await expect(gameOver).toBeVisible()
  await expect(gameOver).toContainText('Punkte')
})

test('President rules can be read', async ({ page }) => {
  await page.goto('/#/games/president/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: President' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kartentausch' })).toBeVisible()
})
