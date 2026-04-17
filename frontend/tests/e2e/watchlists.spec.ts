import { expect, test } from '@playwright/test'

test.describe('WatchlistsPage', () => {
  test.beforeEach(async ({ page }) => {
    // Start with clean, known state
    await page.addInitScript(() => {
      window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
        state: {
          watchlists: [
            { id: 'test-core', name: 'Core', symbols: ['SPY', 'QQQ'] },
            { id: 'test-macro', name: 'Macro', symbols: ['TLT', 'GLD'] },
          ],
          activeWatchlistId: 'test-core',
          recentTickers: ['SPY', 'NVDA', 'AAPL'],
          compareTickers: ['SPY', 'QQQ'],
        },
        version: 0,
      }))
    })
    await page.goto('/watchlists')
    await expect(page.locator('.watchlists-grid')).toBeVisible()
  })

  test('renders watchlist book and management controls', async ({ page }) => {
    await expect(page.getByText('Watchlist Book')).toBeVisible()
    await expect(page.locator('.toolbar-chip', { hasText: 'Core' })).toBeVisible()
    await expect(page.locator('.toolbar-chip', { hasText: 'Macro' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'RENAME' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'CREATE' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'DELETE' })).toBeVisible()
    // ADD button is in .watchlist-admin (batch add section)
    await expect(page.locator('.watchlist-admin button', { hasText: 'ADD' })).toBeVisible()
  })

  test('switching watchlist tabs changes active list', async ({ page }) => {
    const macroTab = page.locator('.toolbar-chip', { hasText: 'Macro' })
    await macroTab.click()
    await expect(macroTab).toHaveClass(/is-active/)
    // Core tab should no longer be active
    await expect(page.locator('.toolbar-chip', { hasText: 'Core' })).not.toHaveClass(/is-active/)
  })

  test('create new watchlist adds a tab', async ({ page }) => {
    const nameInput = page.locator('input[placeholder="New watchlist"]')
    await nameInput.fill('Tech')
    await page.locator('button', { hasText: 'CREATE' }).click()
    // New tab should appear
    await expect(page.locator('.toolbar-chip', { hasText: 'Tech' })).toBeVisible()
  })

  test('rename watchlist updates the tab label', async ({ page }) => {
    // The Core tab should be active; rename input should be pre-filled
    const renameInput = page.locator('input[placeholder*="Rename"]').or(
      page.locator('.watchlist-admin').locator('input').first()
    )
    await renameInput.fill('MyCore')
    await page.locator('button', { hasText: 'RENAME' }).click()
    await expect(page.locator('.toolbar-chip', { hasText: 'MyCore' })).toBeVisible()
  })

  test('delete button is disabled with only one watchlist', async ({ page }) => {
    // Delete until 1 watchlist remains
    const macroTab = page.locator('.toolbar-chip', { hasText: 'Macro' })
    await macroTab.click()
    await page.locator('button', { hasText: 'DELETE' }).click()
    // Delete button should now be disabled
    await expect(page.locator('button', { hasText: 'DELETE' })).toBeDisabled()
  })

  test('delete watchlist removes the tab', async ({ page }) => {
    // Click Macro tab then delete
    await page.locator('.toolbar-chip', { hasText: 'Macro' }).click()
    await page.locator('button', { hasText: 'DELETE' }).click()
    await expect(page.locator('.toolbar-chip', { hasText: 'Macro' })).toHaveCount(0)
    // Core should still exist
    await expect(page.locator('.toolbar-chip', { hasText: 'Core' })).toBeVisible()
  })

  test('batch add symbols adds them to the watchlist', async ({ page }) => {
    const addInput = page.locator('input[placeholder*="Batch add"]')
    await addInput.fill('NVDA, TSLA')
    // Click the ADD button scoped to .watchlist-admin to avoid strict mode violations
    await page.locator('.watchlist-admin button', { hasText: 'ADD' }).click()
    // Input should be cleared after add
    await expect(addInput).toHaveValue('')
    // The chip count on Core tab should increase
    const coreChip = page.locator('.toolbar-chip', { hasText: 'Core' })
    await expect(coreChip).toContainText('4') // was 2, added 2 more
  })

  test('batch add via Enter key works', async ({ page }) => {
    const addInput = page.locator('input[placeholder*="Batch add"]')
    await addInput.fill('MSFT')
    await addInput.press('Enter')
    await expect(addInput).toHaveValue('')
    const coreChip = page.locator('.toolbar-chip', { hasText: 'Core' })
    await expect(coreChip).toContainText('3')
  })

  test('recent symbols ADD/RM toggles correctly', async ({ page }) => {
    // NVDA is in recentTickers but not in Core watchlist
    // Scope to the Recent Symbols section panel
    const recentSection = page.locator('.terminal-panel').filter({ hasText: 'Recent Symbols' })
    const nvdaRow = recentSection.locator('tr', { hasText: 'NVDA' })
    const actionBtn = nvdaRow.locator('.table-action')
    await expect(actionBtn).toContainText('ADD')
    await actionBtn.click()
    // Should toggle to RM
    await expect(actionBtn).toContainText('RM')
  })

  test('ANN button opens and closes annotation editor', async ({ page }) => {
    // Wait for monitor table to load symbols
    const annBtn = page.locator('.table-action', { hasText: 'ANN' }).first()
    await expect(annBtn).toBeVisible({ timeout: 15000 })
    await annBtn.click()
    // Annotation editor should appear
    await expect(page.locator('.ann-editor')).toBeVisible()
    await expect(annBtn).toHaveClass(/is-active/)
    // Click again to close
    await annBtn.click()
    await expect(page.locator('.ann-editor')).toHaveCount(0)
  })

  test('annotation editor saves note', async ({ page }) => {
    const annBtn = page.locator('.table-action', { hasText: 'ANN' }).first()
    await expect(annBtn).toBeVisible({ timeout: 15000 })
    await annBtn.click()
    await expect(page.locator('.ann-editor')).toBeVisible()

    const noteInput = page.locator('.ann-editor input[placeholder="Note / thesis"]')
    await noteInput.fill('Test note')
    await page.locator('.ann-editor button', { hasText: 'SAVE' }).click()

    // Editor should close
    await expect(page.locator('.ann-editor')).toHaveCount(0)
  })

  test('COMP flow button navigates to compare', async ({ page }) => {
    const compBtn = page.locator('.table-action', { hasText: 'COMP' }).first()
    await expect(compBtn).toBeVisible({ timeout: 15000 })
    await compBtn.click()
    await expect(page).toHaveURL(/\/compare/)
  })

  test('BT flow button navigates to backtest', async ({ page }) => {
    const btBtn = page.locator('.table-action', { hasText: 'BT' }).first()
    await expect(btBtn).toBeVisible({ timeout: 15000 })
    await btBtn.click()
    await expect(page).toHaveURL(/\/backtest\?ticker=/)
  })

  test('RM flow button removes symbol from watchlist', async ({ page }) => {
    const rmBtn = page.locator('.table-action', { hasText: 'RM' }).first()
    await expect(rmBtn).toBeVisible({ timeout: 15000 })
    await rmBtn.click()
    // One symbol should be removed — Core chip count decreases
    const coreChip = page.locator('.toolbar-chip', { hasText: 'Core' })
    await expect(coreChip).toContainText('1')
  })
})
