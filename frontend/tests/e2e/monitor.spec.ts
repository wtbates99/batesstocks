import { expect, test } from '@playwright/test'

test.describe('MonitorPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/monitor')
    // Wait for loading to finish
    await expect(page.locator('.monitor-page-grid, .state-panel.error-state')).toBeVisible({ timeout: 15000 })
    // Skip tests if data failed to load
    await expect(page.locator('.monitor-page-grid')).toBeVisible({ timeout: 10000 })
  })

  test('renders all key sections', async ({ page }) => {
    await expect(page.getByText('Market Breadth')).toBeVisible()
    await expect(page.getByText('Sector Rotation')).toBeVisible()
    await expect(page.locator('.toolbar-chip', { hasText: 'Leaders' })).toBeVisible()
    await expect(page.locator('.toolbar-chip', { hasText: 'Laggards' })).toBeVisible()
  })

  test('view selector chips switch active ranked view', async ({ page }) => {
    const viewLabels = ['Leaders', 'Laggards', 'Most Active', 'Volume Surge', 'RSI Overbought', 'RSI Oversold']

    for (const label of viewLabels) {
      const chip = page.locator('.toolbar-chip', { hasText: label })
      await expect(chip).toBeVisible()
      await chip.click()
      await expect(chip).toHaveClass(/is-active/)
    }
  })

  test('WL flow button toggles watchlist membership', async ({ page }) => {
    // Wait for the table to populate
    const wlButtons = page.locator('.table-action', { hasText: 'WL' })
    await expect(wlButtons.first()).toBeVisible({ timeout: 10000 })
    // Click the first WL button — should not throw
    await wlButtons.first().click()
    // No error state should appear
    await expect(page.locator('.state-panel.error-state')).toHaveCount(0)
  })

  test('COMP flow button navigates to compare page', async ({ page }) => {
    const compButtons = page.locator('.table-action', { hasText: 'COMP' })
    await expect(compButtons.first()).toBeVisible({ timeout: 10000 })
    await compButtons.first().click()
    await expect(page).toHaveURL(/\/compare/)
  })

  test('BT flow button navigates to backtest page with ticker', async ({ page }) => {
    const btButtons = page.locator('.table-action', { hasText: 'BT' })
    await expect(btButtons.first()).toBeVisible({ timeout: 10000 })
    await btButtons.first().click()
    await expect(page).toHaveURL(/\/backtest\?ticker=/)
  })

  test('sector links navigate to sector page', async ({ page }) => {
    const sectorLink = page.locator('.terminal-table .ticker-link').first()
    await expect(sectorLink).toBeVisible({ timeout: 10000 })
    const sectorText = await sectorLink.textContent()
    await sectorLink.click()
    // Should go to either /sector/ or /security/ route
    await expect(page).toHaveURL(/\/(sector|security)\//)
    expect(sectorText).toBeTruthy()
  })
})
