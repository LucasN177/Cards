import { expect, type Page, test } from '@playwright/test'

test('Doppelkopf: reservation, announcing and four games', async ({ page, isMobile }) => {
  test.setTimeout(240_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: {
            doppelkopf: {
              opponents: 3,
              difficulty: 'beginner',
              options: { games: 4, nines: false },
            },
          },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/doppelkopf')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const hand = page.getByRole('group', { name: 'Deine Karten' })
  const tap = async (locator: ReturnType<Page['locator']>) => {
    if (isMobile) await locator.tap({ position: { x: 8, y: 12 } })
    else await locator.click({ position: { x: 8, y: 12 } })
  }
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const next = page.getByRole('button', { name: 'Nächstes Spiel' })
  const healthy = page.getByRole('button', { name: 'Gesund' })
  const announce = page.getByRole('button', { name: /(Re|Kontra) ansagen/ })
  let announced = false
  for (let step = 0; step < 800 && !(await gameOver.isVisible()); step++) {
    const card = hand.locator('button[aria-disabled="false"]').first()
    if (await next.isVisible()) await next.click()
    else if (await healthy.isVisible()) await healthy.click()
    else if (!announced && (await announce.isVisible())) {
      await announce.click()
      announced = true
      await expect(page.getByText(/„(Re|Kontra)“/).first()).toBeVisible()
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

test('Doppelkopf rules can be read', async ({ page }) => {
  await page.goto('/#/games/doppelkopf/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Doppelkopf' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vorbehalt und Soli' })).toBeVisible()
})
