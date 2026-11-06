import { expect, type Page, test } from '@playwright/test'

async function settings(page: Page, options: Record<string, unknown>) {
  await page.goto('/')
  await page.evaluate((opts) => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { 'gin-rummy': { opponents: 1, difficulty: 'beginner', options: opts } },
        },
        version: 1,
      }),
    )
  }, options)
  await page.reload()
}

/** Plays until `done` is visible: pass the upcard, draw from the stock, knock or discard. */
async function play(page: Page, isMobile: boolean, done: ReturnType<Page['locator']>) {
  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const stock = page.getByRole('button', { name: /^Stapel/ })
  const pass = page.getByRole('button', { name: 'Passen' })
  const knock = page.getByRole('button', { name: /^(Klopfen|Gin!)/ })
  const discard = page.getByRole('button', { name: /ablegen$/ })
  const next = page.getByRole('button', { name: 'Nächste Hand' })
  let discards = 0
  for (let step = 0; step < 2000 && !(await done.isVisible()); step++) {
    if (await next.isVisible()) await next.click()
    else if (await pass.isVisible()) await pass.click()
    else if (await stock.isEnabled()) await stock.click()
    else if ((await knock.isVisible()) && (await knock.isEnabled())) await knock.click()
    else if ((await discard.isVisible()) && (await discard.isEnabled())) {
      await discard.click()
      discards++
    } else {
      // Select the last card (or another one if that is the card just taken).
      const cards = hand.locator('button[aria-disabled="false"]')
      const count = await cards.count()
      if (count === 0) {
        await page.waitForTimeout(100)
        continue
      }
      const card = cards.nth((step % 2 === 0 ? count - 1 : 0) as number)
      if (isMobile) await card.tap({ position: { x: 8, y: 12 } })
      else await card.click({ position: { x: 8, y: 12 } })
    }
  }
  return discards
}

test('Gin Rummy: a whole hand through the table', async ({ page, isMobile }) => {
  test.setTimeout(300_000)
  await settings(page, { targetScore: 0 })
  await page.goto('/#/games/gin-rummy')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page.getByText(/aufgedeckte Karte|ist am Zug|Zieh/).first()).toBeVisible()
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const discards = await play(page, isMobile, gameOver)
  await expect(gameOver).toBeVisible()
  expect(discards).toBeGreaterThan(0)
})

test('Gin Rummy: the hand summary shows both hands', async ({ page, isMobile }) => {
  test.setTimeout(300_000)
  await settings(page, { targetScore: 100 })
  await page.goto('/#/games/gin-rummy')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  const summary = page.getByRole('dialog', { name: /klopft|Gin|Keine Wertung/ })
  await play(page, isMobile, summary)
  await expect(summary).toBeVisible()
  await expect(summary.getByRole('table', { name: 'Zwischenstand' })).toBeVisible()
})

test('Gin Rummy rules can be read', async ({ page }) => {
  await page.goto('/#/games/gin-rummy/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Gin Rummy' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wertung' })).toBeVisible()
})
