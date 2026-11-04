import { expect, test } from '@playwright/test'

test('the app bar can be moved to the bottom on phones', async ({ page, isMobile }) => {
  await page.goto('/#/settings')
  await page.getByText('Unten', { exact: true }).click()
  await page.reload()

  const viewport = page.viewportSize()!
  const appBar = page.locator('header.app-bar')
  const box = async () => (await appBar.boundingBox())!

  if (isMobile) {
    // At the bottom edge, also after a reload (the setting is stored on the device).
    expect(Math.round((await box()).y + (await box()).height)).toBe(viewport.height)
    await page.getByRole('link', { name: 'Spiele' }).click()
    await page.getByRole('link', { name: /^Mau-Mau/ }).click()
    await page.getByRole('button', { name: /Spiel starten/ }).click()
    const tableBar = page.locator('header.app-bar')
    await expect(tableBar).toContainText('Mau-Mau')
    const tableBox = (await tableBar.boundingBox())!
    expect(Math.round(tableBox.y + tableBox.height)).toBe(viewport.height)
    // Nothing overflows: the hand sits above the bar.
    const hand = (await page.getByRole('group', { name: 'Deine Karten' }).boundingBox())!
    expect(hand.y + hand.height).toBeLessThanOrEqual(tableBox.y + 1)
  } else {
    // Desktop and tablets keep the bar at the top.
    expect((await box()).y).toBe(0)
  }
})
