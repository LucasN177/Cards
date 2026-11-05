import { expect, type Page, test } from '@playwright/test'

async function settings(page: Page, options: Record<string, unknown>) {
  await page.goto('/')
  await page.evaluate((opts) => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { hearts: { opponents: 3, difficulty: 'beginner', options: opts } },
        },
        version: 1,
      }),
    )
  }, options)
  await page.reload()
}

test('Hearts: pass three cards and play a whole hand', async ({ page, isMobile }) => {
  test.setTimeout(120_000)
  await settings(page, { targetScore: 0, passing: true })
  await page.goto('/#/games/hearts')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }

  // Passing: choose three cards, the button counts along.
  const passButton = page.getByRole('button', { name: /Weitergeben/ })
  await expect(passButton).toBeDisabled()
  for (let i = 0; i < 3; i++) await tap(hand.getByRole('button').nth(i))
  await expect(passButton).toHaveText('Weitergeben (3/3)')
  await passButton.click()
  await expect(page.getByText(/^Erhalten:/)).toBeVisible()

  // Playing: always the first allowed card (touch: tap twice).
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  for (let step = 0; step < 200 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if ((await card.count()) > 0) {
      await tap(card)
      if (
        isMobile &&
        (await card.count()) > 0 &&
        (await card.getAttribute('aria-pressed')) === 'true'
      ) {
        await tap(card)
      }
    } else {
      await page.waitForTimeout(150)
    }
  }
  await expect(gameOver).toBeVisible()
  await expect(gameOver).toContainText('Punkte')
})

test('Hearts: rules and settings are available', async ({ page }) => {
  await page.goto('/#/games/hearts')
  await expect(page.getByText('Spielende')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Karten weitergeben' })).toBeChecked()
  await expect(page.getByText('Durchmarsch (alle Strafkarten)')).toBeVisible()
  await expect(page.getByText('32 Karten (7 bis Ass)')).toBeVisible()
  await page.getByRole('link', { name: /Spielregeln lesen/ }).click()
  await expect(page.getByRole('heading', { name: 'Spielregeln: Hearts' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wertung' })).toBeVisible()
})

test('Hearts with 32 cards: eight cards each, a whole hand', async ({ page, isMobile }) => {
  test.setTimeout(120_000)
  await settings(page, { targetScore: 0, passing: false, deck: 'piquet32' })
  await page.goto('/#/games/hearts')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  await expect(hand.getByRole('button')).toHaveCount(8)
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  for (let step = 0; step < 150 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if ((await card.count()) > 0) {
      if (isMobile) await card.tap({ position: { x: 8, y: 12 } })
      else await card.click({ position: { x: 8, y: 12 } })
      if (
        isMobile &&
        (await card.count()) > 0 &&
        (await card.getAttribute('aria-pressed')) === 'true'
      )
        await card.tap({ position: { x: 8, y: 12 } })
    } else await page.waitForTimeout(150)
  }
  await expect(gameOver).toBeVisible()
})
