import { expect, test } from '@playwright/test'

test.describe('ComparePage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
        state: {
          compareTickers: ['SPY', 'QQQ', 'IWM'],
          savedCompareSets: [],
          watchlists: [{ id: 'core', name: 'Core', symbols: ['SPY'] }],
          activeWatchlistId: 'core',
          recentTickers: ['SPY'],
        },
        version: 0,
      }))
    })
    await page.goto('/compare')
    await expect(page.locator('.compare-grid')).toBeVisible()
    await expect(page.getByText('Relative Performance')).toBeVisible()
  })

  test('renders compare set panel with current tickers', async ({ page }) => {
    await expect(page.getByText('Compare Set')).toBeVisible()
    // Scope to the compare set panel to avoid strict mode violations from duplicate .ticker-link
    const compareSetPanel = page.locator('.terminal-panel').filter({ hasText: 'Compare Set' })
    await expect(compareSetPanel.locator('.ticker-link', { hasText: 'SPY' }).first()).toBeVisible()
    await expect(compareSetPanel.locator('.ticker-link', { hasText: 'QQQ' }).first()).toBeVisible()
    await expect(compareSetPanel.locator('.ticker-link', { hasText: 'IWM' }).first()).toBeVisible()
  })

  test('RM button removes ticker from compare set', async ({ page }) => {
    // There are RM buttons in both the compare set panel and snapshot table
    // Use the one in Compare Set panel (first RM in tbody)
    const compareSetPanel = page.getByText('Compare Set').locator('../..')
    const rmBtn = compareSetPanel.locator('.table-action', { hasText: 'RM' }).first()
    await rmBtn.click()
    // One ticker should be removed — count drops from 3 to 2
    const panelMeta = page.locator('.panel-header').filter({ hasText: 'Compare Set' }).locator('.panel-meta')
    await expect(panelMeta).toContainText('2 symbols')
  })

  test('RESET button resets to SPY / QQQ', async ({ page }) => {
    await page.locator('.terminal-button', { hasText: 'RESET' }).click()
    const panelMeta = page.locator('.panel-header').filter({ hasText: 'Compare Set' }).locator('.panel-meta')
    await expect(panelMeta).toContainText('2 symbols')
    const compareSetPanel = page.locator('.terminal-panel').filter({ hasText: 'Compare Set' })
    await expect(compareSetPanel.locator('.ticker-link', { hasText: 'SPY' }).first()).toBeVisible()
    await expect(compareSetPanel.locator('.ticker-link', { hasText: 'QQQ' }).first()).toBeVisible()
  })

  test('SAVE SET stores current tickers and shows in saved list', async ({ page }) => {
    await page.locator('.terminal-button', { hasText: 'SAVE SET' }).click()
    // Saved set should appear in the inline list — scope to compare page panel not AI panel
    const compareSetPanel = page.locator('.terminal-panel').filter({ hasText: 'Compare Set' })
    await expect(compareSetPanel.locator('.saved-inline-button').first()).toBeVisible()
    await expect(compareSetPanel.locator('.saved-inline-button').first()).toContainText('SPY')
  })

  test('loading a saved set updates the compare tickers', async ({ page }) => {
    // First save a set
    await page.locator('.terminal-button', { hasText: 'SAVE SET' }).click()
    const compareSetPanel = page.locator('.terminal-panel').filter({ hasText: 'Compare Set' })
    await expect(compareSetPanel.locator('.saved-inline-button').first()).toBeVisible()
    // Then reset to SPY/QQQ
    await page.locator('.terminal-button', { hasText: 'RESET' }).click()
    // Then load the saved set
    await compareSetPanel.locator('.saved-inline-button').first().click()
    // Should restore IWM
    await expect(compareSetPanel.locator('.ticker-link', { hasText: 'IWM' }).first()).toBeVisible()
  })

  test('VIEW button in snapshot table navigates to security page', async ({ page }) => {
    // Wait for snapshots to load
    const viewBtn = page.locator('.table-action', { hasText: 'VIEW' }).first()
    await expect(viewBtn).toBeVisible({ timeout: 15000 })
    await viewBtn.click()
    await expect(page).toHaveURL(/\/security\//)
  })

  test('ticker links navigate to security page', async ({ page }) => {
    // Use the ticker link in the compare set panel (always visible, unlike chart legend on mobile)
    const compareSetPanel = page.locator('.terminal-panel').filter({ hasText: 'Compare Set' })
    const spyLink = compareSetPanel.locator('.ticker-link', { hasText: 'SPY' }).first()
    await expect(spyLink).toBeVisible()
    await spyLink.click()
    await expect(page).toHaveURL('/security/SPY')
  })
})

test.describe('NewsMonitorPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
        state: {
          activeTicker: 'SPY',
          watchlists: [{ id: 'core', name: 'Core', symbols: ['SPY', 'QQQ'] }],
          activeWatchlistId: 'core',
          recentTickers: ['SPY', 'QQQ', 'AAPL'],
          compareTickers: ['SPY', 'QQQ'],
        },
        version: 0,
      }))
    })
    await page.goto('/news')
    await expect(page.locator('.news-monitor-grid')).toBeVisible({ timeout: 10000 })
  })

  test('renders News Scope section with scope buttons', async ({ page }) => {
    await expect(page.getByText('News Scope')).toBeVisible()
    await expect(page.locator('.toolbar-chip', { hasText: 'FOCUS' })).toBeVisible()
    await expect(page.locator('.toolbar-chip', { hasText: 'WATCHLIST' })).toBeVisible()
    await expect(page.locator('.toolbar-chip', { hasText: 'RECENT' })).toBeVisible()
    await expect(page.locator('.toolbar-chip', { hasText: 'MARKET' })).toBeVisible()
  })

  test('WATCHLIST scope is active by default', async ({ page }) => {
    await expect(page.locator('.toolbar-chip', { hasText: 'WATCHLIST' })).toHaveClass(/is-active/)
  })

  test('scope buttons switch the active scope and update stats panel', async ({ page }) => {
    const scopes = [
      { label: 'FOCUS', text: 'FOCUS' },
      { label: 'RECENT', text: 'RECENT' },
      { label: 'MARKET', text: 'MARKET' },
      { label: 'WATCHLIST', text: 'WATCHLIST' },
    ]

    for (const { label, text } of scopes) {
      const chip = page.locator('.toolbar-chip', { hasText: label })
      await chip.click()
      await expect(chip).toHaveClass(/is-active/)
      // Stats panel should show current scope
      await expect(page.locator('.stats-cell', { hasText: 'Scope' }).locator('.stats-value')).toContainText(text)
    }
  })
})
