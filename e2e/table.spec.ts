import { expect, type Page, test } from '@playwright/test'

async function startQuickGame(page: Page, handSize = 3) {
  await page.goto('/')
  await page.evaluate((size) => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: {
            'high-card': { opponents: 2, difficulty: 'beginner', options: { handSize: size } },
          },
        },
        version: 1,
      }),
    )
  }, handSize)
  // A hash-only navigation keeps the page alive; reload so the store reads the new settings.
  await page.goto('/#/games/high-card')
  await page.reload()
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page).toHaveURL(/#\/play\/high-card$/)
}

const hand = (page: Page) => page.getByRole('group', { name: 'Deine Karten' }).getByRole('button')

test('the table fits the screen without scrolling', async ({ page }) => {
  await startQuickGame(page, 8)
  await expect(hand(page)).toHaveCount(8)

  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow.x).toBeLessThanOrEqual(0)
  expect(overflow.y).toBeLessThanOrEqual(0)

  // Every card in the hand must be on screen and at least partly tappable.
  const viewport = page.viewportSize()!
  for (const card of await hand(page).all()) {
    const box = (await card.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  }
})

test('plays a full game', async ({ page, isMobile }) => {
  await startQuickGame(page)
  const dialog = page.getByRole('dialog')

  while (!(await dialog.isVisible())) {
    const status = page.locator('[aria-live="polite"]')
    if ((await status.textContent())?.includes('Du bist dran')) {
      const card = hand(page).first()
      if (isMobile) {
        // Touch: the first tap only lifts the card, the second one plays it.
        await card.tap()
        await expect(card).toHaveAttribute('aria-pressed', 'true')
        await card.tap()
      } else {
        await card.click()
      }
    }
    await page.waitForTimeout(200)
  }

  await expect(dialog.getByRole('heading')).toHaveText(/Gewonnen|Verloren|Unentschieden/)
  await dialog.getByRole('button', { name: 'Spielauswahl' }).click()
  await expect(page.getByRole('heading', { name: 'Spielauswahl' })).toBeVisible()
})
