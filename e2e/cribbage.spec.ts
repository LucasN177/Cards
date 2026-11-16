import { expect, type Page, test } from '@playwright/test'

async function settings(page: Page, options: Record<string, unknown>) {
  await page.goto('/')
  await page.evaluate((opts) => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { cribbage: { opponents: 1, difficulty: 'beginner', options: opts } },
        },
        version: 1,
      }),
    )
  }, options)
  await page.reload()
}

/** Plays until `done` is visible: crib the first cards, then play the first playable card. */
async function play(page: Page, isMobile: boolean, done: ReturnType<Page['locator']>) {
  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const crib = page.getByRole('button', { name: /^In den Crib legen/ })
  const next = page.getByRole('button', { name: 'Nächste Hand' })
  let plays = 0
  for (let step = 0; step < 3000 && !(await done.isVisible()); step++) {
    if (await next.isVisible()) await next.click()
    else if ((await crib.isVisible()) && (await crib.isEnabled())) await crib.click()
    else {
      const cards = hand.locator('button[aria-disabled="false"]')
      if ((await cards.count()) === 0) {
        await page.waitForTimeout(100)
        continue
      }
      // Crib: choose the next card not chosen yet (the button shows how many are chosen).
      const chosen = (await crib.isVisible())
        ? Number(/\((\d+)\//.exec((await crib.textContent()) ?? '')?.[1] ?? 0)
        : 0
      const card = cards.nth(chosen)
      if (isMobile) {
        await card.tap({ position: { x: 8, y: 12 } })
        if (!(await crib.isVisible())) await card.tap({ position: { x: 8, y: 12 } })
      } else await card.click({ position: { x: 8, y: 12 } })
      if (!(await crib.isVisible())) plays++
    }
  }
  return plays
}

test('Cribbage: a hand through the table up to the show', async ({ page, isMobile }) => {
  test.setTimeout(300_000)
  await settings(page, { targetScore: 121 })
  await page.goto('/#/games/cribbage')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page.getByText(/Crib/).first()).toBeVisible()
  const summary = page.getByRole('dialog', { name: /Auszählen/ })
  const plays = await play(page, isMobile, summary)
  await expect(summary).toBeVisible()
  await expect(summary.getByRole('table', { name: 'Zwischenstand' })).toBeVisible()
  expect(plays).toBeGreaterThan(0)
})

test('Cribbage: a whole game to 61', async ({ page, isMobile }) => {
  test.setTimeout(600_000)
  await settings(page, { targetScore: 61 })
  await page.goto('/#/games/cribbage')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  await play(page, isMobile, gameOver)
  await expect(gameOver).toBeVisible()
})

test('Cribbage rules can be read', async ({ page }) => {
  await page.goto('/#/games/cribbage/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Cribbage' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Auszählen' })).toBeVisible()
})
