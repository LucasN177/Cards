import { expect, test } from '@playwright/test'

test('Blackjack: bet, play and settle five rounds', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          games: { blackjack: { opponents: 0, difficulty: 'beginner', options: { rounds: 5 } } },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/blackjack')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren/ })
  for (let step = 0; step < 80 && !(await gameOver.isVisible()); step++) {
    const bet = page.getByRole('button', { name: '5 setzen', exact: true })
    const stand = page.getByRole('button', { name: 'Stehen' })
    const next = page.getByRole('button', { name: /Nächste Runde|Abrechnen/ })
    if (await bet.isVisible()) await bet.click()
    else if ((await stand.isVisible()) && (await stand.isEnabled())) {
      // The hint marks the recommended move; follow it once to make sure it works.
      if (step === 1) await page.getByRole('button', { name: /Tipp/ }).click()
      await stand.click()
    } else if (await next.isVisible()) await next.click()
    else await page.waitForTimeout(100)
  }
  await expect(gameOver).toBeVisible()
  await expect(gameOver).toContainText('Chips')
})

test('Blackjack rules can be read', async ({ page }) => {
  await page.goto('/#/games/blackjack/rules')
  await expect(page.getByRole('heading', { name: 'Spielregeln: Blackjack' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Auszahlung' })).toBeVisible()
})
