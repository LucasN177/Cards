import { expect, type Page, test } from '@playwright/test'

test('Sechsundsechzig: play a hand against the AI', async ({ page, isMobile }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: {
            sechsundsechzig: { opponents: 1, difficulty: 'beginner', options: { target: 1 } },
          },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/sechsundsechzig')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page.getByText(/Trumpf (Kreuz|Pik|Herz|Karo)/)).toBeVisible()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const meld = page.getByRole('button', { name: /melden/ })
  for (let step = 0; step < 300 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if ((await meld.count()) > 0 && (await meld.first().isVisible())) await meld.first().click()
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
  await expect(gameOver).toContainText('Gewinnpunkte')
})

test('Sechsundsechzig rules can be read', async ({ page }) => {
  await page.goto('/#/games/sechsundsechzig/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Sechsundsechzig' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Melden, Tauschen, Zudrehen' })).toBeVisible()
})
