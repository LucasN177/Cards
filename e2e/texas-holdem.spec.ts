import { expect, test } from '@playwright/test'

test("Texas Hold'em: a whole game heads-up through the table", async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: {
            'texas-holdem': {
              opponents: 1,
              difficulty: 'beginner',
              options: { handLimit: 30, startingStack: 1000, risingBlinds: true },
            },
          },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/texas-holdem')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page.getByText(/Pot: \d+/)).toBeVisible()

  const passive = page.getByRole('button', { name: /^(Schieben|Mitgehen)/ })
  const raise = page.getByRole('button', { name: /^(Erhöhen auf|Setzen|All-in) / })
  const next = page.getByRole('button', { name: 'Nächste Hand' })
  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  let summaries = 0
  let raises = 0
  for (let step = 0; step < 3000 && !(await gameOver.isVisible()); step++) {
    if (await next.isVisible()) {
      summaries++
      await next.click()
    } else if ((await raise.isVisible()) && step % 7 === 0) {
      await raise.click()
      raises++
    } else if (await passive.isVisible()) await passive.click()
    else await page.waitForTimeout(50)
  }
  await expect(gameOver).toBeVisible()
  expect(summaries).toBeGreaterThan(0)
  expect(raises).toBeGreaterThan(0)
})

test("Texas Hold'em rules can be read", async ({ page }) => {
  await page.goto('/#/games/texas-holdem/rules')
  await expect(page.getByRole('heading', { name: "Spielregeln: Texas Hold'em" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Die Hände (von oben nach unten)' })).toBeVisible()
})
