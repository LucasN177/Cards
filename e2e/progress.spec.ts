import { expect, type Page, test } from '@playwright/test'

async function setUp(page: Page, handSize: number, extra: Record<string, unknown> = {}) {
  await page.goto('/')
  await page.evaluate(
    ({ size, more }) => {
      localStorage.setItem(
        'cards:settings',
        JSON.stringify({
          state: {
            gameSpeed: 'fast',
            games: {
              'high-card': { opponents: 1, difficulty: 'beginner', options: { handSize: size } },
            },
            ...more,
          },
          version: 1,
        }),
      )
    },
    { size: handSize, more: extra },
  )
  await page.reload()
}

const hand = (page: Page) => page.getByRole('group', { name: 'Deine Karten' }).getByRole('button')

async function playCard(page: Page, isMobile: boolean) {
  const card = hand(page).first()
  if (isMobile) {
    await card.tap({ position: { x: 8, y: 12 } })
    await card.tap({ position: { x: 8, y: 12 } })
  } else {
    await card.click()
  }
}

test('a running game survives a reload', async ({ page, isMobile }) => {
  await setUp(page, 3)
  await page.goto('/#/play/high-card')
  await expect(hand(page)).toHaveCount(3)
  await playCard(page, isMobile)
  await expect(hand(page)).toHaveCount(2)

  await page.reload()
  await expect(page.getByText('Gespeicherte Partie fortgesetzt')).toBeVisible()
  await expect(hand(page)).toHaveCount(2)

  // The catalog marks the running game.
  await page.getByRole('button', { name: 'Zur Spielauswahl' }).click()
  await expect(page.getByRole('link', { name: /High Card/ })).toContainText('Läuft')
})

test('finished games show up in the statistics', async ({ page, isMobile }) => {
  await setUp(page, 1)
  await page.goto('/#/play/high-card')
  await playCard(page, isMobile)
  const dialog = page.getByRole('dialog', { name: /Gewonnen|Verloren|Unentschieden/ })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Spielauswahl' }).click()

  await page.getByRole('link', { name: 'Statistik' }).click()
  await expect(page.getByRole('heading', { name: 'Statistik', level: 1 })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Spielverlauf' }).getByRole('listitem')).toHaveCount(
    1,
  )
  await expect(page.getByRole('heading', { name: 'High Card' })).toBeVisible()

  // Still there after a reload: the history lives in IndexedDB.
  await page.reload()
  await expect(page.getByRole('list', { name: 'Spielverlauf' }).getByRole('listitem')).toHaveCount(
    1,
  )
})

test('saving and statistics can be switched off', async ({ page, isMobile }) => {
  await setUp(page, 3, { saveGames: false, recordStats: false })
  await page.goto('/#/play/high-card')
  await playCard(page, isMobile)
  await expect(hand(page)).toHaveCount(2)

  await page.reload()
  await expect(hand(page)).toHaveCount(3)
  await expect(page.getByText('Gespeicherte Partie fortgesetzt')).toBeHidden()

  await page.goto('/#/stats')
  await expect(page.getByText('Aufzeichnung ist ausgeschaltet')).toBeVisible()
})
