import { expect, type Page, test } from '@playwright/test'

async function useFastSettings(page: Page, opponents = 1) {
  await page.goto('/')
  await page.evaluate((count) => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: {
          gameSpeed: 'fast',
          games: { 'mau-mau': { opponents: count, difficulty: 'beginner' } },
        },
        version: 1,
      }),
    )
  }, opponents)
  await page.reload()
}

test('Mau-Mau is playable from the catalog', async ({ page }) => {
  await page.goto('/')
  const tile = page.getByRole('link', { name: /Mau-Mau/ })
  await expect(tile).toBeVisible()
  await expect(tile).not.toContainText('Bald')
})

test('plays a full game of Mau-Mau against the AI', async ({ page, isMobile }) => {
  test.setTimeout(120_000)
  await useFastSettings(page)
  await page.goto('/#/games/mau-mau')
  await page.getByRole('button', { name: /Spiel starten/ }).click()

  const gameOver = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  const wish = page.getByRole('dialog', { name: 'Welche Farbe wünschst du dir?' })
  const playable = page
    .getByRole('group', { name: 'Deine Karten' })
    .locator('button[aria-disabled="false"]')
  const pass = page.getByRole('button', { name: 'Weiter' })
  const draw = page.getByRole('button', { name: /Ziehen|Karten ziehen/ })

  for (let step = 0; step < 400 && !(await gameOver.isVisible()); step++) {
    if (await wish.isVisible()) {
      await wish.getByRole('button').first().click()
    } else if ((await playable.count()) > 0) {
      const card = playable.first()
      if (isMobile) {
        // Tap the visible top-left corner, like a finger would on an overlapped hand.
        const corner = { position: { x: 8, y: 12 } }
        await card.tap(corner)
        if ((await card.count()) > 0 && (await card.getAttribute('aria-pressed')) === 'true') {
          await card.tap(corner)
        }
      } else {
        await card.click()
      }
    } else if (await pass.isVisible()) {
      await pass.click()
    } else if (await draw.isVisible()) {
      await draw.click()
    } else {
      await page.waitForTimeout(150)
    }
  }

  await expect(gameOver).toBeVisible()
  await expect(gameOver).toContainText('Strafpunkte')
})

test('the rules can be read before and during a game', async ({ page }) => {
  await useFastSettings(page, 2)
  await page.goto('/#/games/mau-mau')
  await page.getByRole('link', { name: /Spielregeln lesen/ }).click()
  await expect(page.getByRole('heading', { name: 'Spielregeln: Mau-Mau' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sonderkarten' })).toBeVisible()

  await page.getByRole('link', { name: 'Mau-Mau' }).click()
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await page.getByRole('button', { name: 'Spielregeln' }).click()
  const sheet = page.getByRole('dialog', { name: 'Regeln: Mau-Mau' })
  await expect(sheet.getByRole('heading', { name: 'Varianten in diesem Spiel' })).toBeVisible()

  // The sheet scrolls on its own; the page behind it must not.
  await sheet.getByRole('heading', { name: 'Bedienung' }).scrollIntoViewIfNeeded()
  await expect(sheet.getByRole('heading', { name: 'Bedienung' })).toBeInViewport()
  await sheet.getByRole('button', { name: 'Regeln schließen' }).click()
  await expect(sheet).toBeHidden()
})

test('a match over several rounds shows the round in the header', async ({ page }) => {
  await useFastSettings(page)
  await page.goto('/#/games/mau-mau')
  await page.getByText('3 Runden', { exact: true }).click()
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  await expect(page.getByRole('heading', { name: 'Mau-Mau · Runde 1/3' })).toBeVisible()
})

test('expert opponents think in a web worker', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'cards:settings',
      JSON.stringify({
        state: { gameSpeed: 'fast', games: { 'mau-mau': { opponents: 3, difficulty: 'expert' } } },
        version: 1,
      }),
    )
  })
  await page.reload()
  await page.goto('/#/games/mau-mau')
  const worker = page.waitForEvent('worker')
  await page.getByRole('button', { name: /Spiel starten/ }).click()
  expect((await worker).url()).toContain('aiWorker')

  // At least one opponent move happens (via the worker) without errors on the page.
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const status = page.locator('[aria-live="polite"]')
  await expect(status).toContainText(/Du bist dran|ist am Zug/, { timeout: 15_000 })
  // The starting player is random; if it is us, draw a card to hand the turn on.
  if ((await status.textContent())?.includes('Du bist dran')) {
    await page.getByRole('button', { name: /Ziehen|Karten ziehen/ }).click()
    const pass = page.getByRole('button', { name: 'Weiter' })
    if (await pass.isVisible()) await pass.click()
  }
  await expect(status).toContainText(/(Anna|Ben|Clara) (spielt|zieht|passt|kann)/, {
    timeout: 15_000,
  })
  expect(errors).toEqual([])
})
