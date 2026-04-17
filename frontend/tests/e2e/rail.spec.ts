import { expect, test } from '@playwright/test'

test.describe('WorkspaceRail', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    // The workspace rail is hidden (display:none) on mobile viewports
    if (isMobile) {
      test.skip()
      return
    }
    await page.addInitScript(() => {
      window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
        state: {
          watchlists: [
            { id: 'core', name: 'Core', symbols: ['SPY', 'QQQ', 'AAPL'] },
            { id: 'macro', name: 'Macro', symbols: ['TLT', 'GLD'] },
          ],
          activeWatchlistId: 'core',
          recentTickers: ['SPY', 'QQQ', 'NVDA'],
          compareTickers: ['SPY', 'QQQ'],
          savedCompareSets: [
            { id: 'saved-1', name: 'Tech Set', tickers: ['AAPL', 'MSFT', 'NVDA'], createdAt: new Date().toISOString() },
          ],
          savedScreens: [
            { id: 'screen-1', name: 'Momentum Screen', createdAt: new Date().toISOString(), draft: { name: 'Momentum Screen', ticker: 'SPY', entryRules: [], exitRules: [], entryOperator: 'and', exitOperator: 'and', universeInput: '', startDate: '', endDate: '', initialCapital: '100000', positionSizePct: '10', stopLossPct: '8', feeBps: '5', slippageBps: '5' } },
          ],
          savedBacktests: [
            { id: 'bt-1', name: 'SPY Backtest', createdAt: new Date().toISOString(), draft: { name: 'SPY Backtest', ticker: 'SPY', entryRules: [], exitRules: [], entryOperator: 'and', exitOperator: 'and', universeInput: '', startDate: '', endDate: '', initialCapital: '100000', positionSizePct: '10', stopLossPct: '8', feeBps: '5', slippageBps: '5' } },
          ],
        },
        version: 0,
      }))
    })
    await page.goto('/')
    await expect(page.locator('.workspace-rail')).toBeVisible()
  })

  test('renders watchlist section with symbols', async ({ page }) => {
    await expect(page.locator('.rail-title', { hasText: 'Watchlist' })).toBeVisible()
    await expect(page.locator('.rail-chip', { hasText: 'Core' })).toBeVisible()
    await expect(page.locator('.rail-chip', { hasText: 'Macro' })).toBeVisible()
  })

  test('switching watchlist tabs in rail changes active watchlist', async ({ page }) => {
    const macroChip = page.locator('.rail-chip', { hasText: 'Macro' })
    await macroChip.click()
    await expect(macroChip).toHaveClass(/is-active/)
    await expect(page.locator('.rail-chip', { hasText: 'Core' })).not.toHaveClass(/is-active/)
  })

  test('watchlist ticker links navigate to security page', async ({ page }) => {
    const spyLink = page.locator('.workspace-rail .ticker-link', { hasText: 'SPY' })
    await expect(spyLink).toBeVisible()
    await spyLink.click()
    await expect(page).toHaveURL('/security/SPY')
  })

  test('delete icon removes symbol from watchlist', async ({ page }) => {
    // SPY is in the watchlist, find its delete button
    const spyRow = page.locator('.workspace-rail .rail-row').filter({ hasText: 'SPY' })
    await expect(spyRow).toBeVisible()
    await spyRow.locator('.terminal-icon-button').click()
    // SPY should be gone from the rail
    await expect(page.locator('.workspace-rail .ticker-link', { hasText: 'SPY' })).toHaveCount(0)
  })

  test('recents section shows recent tickers', async ({ page }) => {
    await expect(page.locator('.rail-title', { hasText: 'Recents' })).toBeVisible()
    await expect(page.locator('.workspace-rail .rail-link', { hasText: 'SPY' })).toBeVisible()
    await expect(page.locator('.workspace-rail .rail-link', { hasText: 'QQQ' })).toBeVisible()
  })

  test('recent ticker links navigate to security page', async ({ page }) => {
    const nvdaLink = page.locator('.workspace-rail .rail-link', { hasText: 'NVDA' })
    await expect(nvdaLink).toBeVisible()
    await nvdaLink.click()
    await expect(page).toHaveURL('/security/NVDA')
  })

  test('saved compare sets visible on compare page', async ({ page }) => {
    await page.goto('/compare')
    await expect(page.locator('.workspace-rail .rail-title', { hasText: 'Saved Compare' })).toBeVisible()
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'Tech Set' })).toBeVisible()
  })

  test('loading a saved compare set from rail navigates to compare', async ({ page }) => {
    await page.goto('/compare')
    const savedSetBtn = page.locator('.workspace-rail .saved-open').first()
    await expect(savedSetBtn).toBeVisible()
    await savedSetBtn.click()
    await expect(page).toHaveURL(/\/compare/)
  })

  test('deleting a saved compare set from rail removes it', async ({ page }) => {
    await page.goto('/compare')
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'Tech Set' })).toBeVisible()
    await page.locator('.workspace-rail .saved-row').locator('.terminal-icon-button').first().click()
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'Tech Set' })).toHaveCount(0)
  })

  test('saved screens visible on screener page', async ({ page }) => {
    await page.goto('/screener')
    await expect(page.locator('.workspace-rail .rail-title', { hasText: 'Saved Screens' })).toBeVisible()
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'Momentum Screen' })).toBeVisible()
  })

  test('deleting a saved screen from rail removes it', async ({ page }) => {
    await page.goto('/screener')
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'Momentum Screen' })).toBeVisible()
    await page.locator('.workspace-rail .saved-row').locator('.terminal-icon-button').first().click()
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'Momentum Screen' })).toHaveCount(0)
  })

  test('saved backtest runs visible on backtest page', async ({ page }) => {
    await page.goto('/backtest')
    await expect(page.locator('.workspace-rail .rail-title', { hasText: 'Saved Runs' })).toBeVisible()
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'SPY Backtest' })).toBeVisible()
  })

  test('deleting a saved backtest run from rail removes it', async ({ page }) => {
    await page.goto('/backtest')
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'SPY Backtest' })).toBeVisible()
    await page.locator('.workspace-rail .saved-row').locator('.terminal-icon-button').first().click()
    await expect(page.locator('.workspace-rail .saved-name', { hasText: 'SPY Backtest' })).toHaveCount(0)
  })
})
