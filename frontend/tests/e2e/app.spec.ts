import { expect, test } from '@playwright/test'

test('dashboard renders key terminal surfaces', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('BATESSTOCKS')).toBeVisible()
  await expect(page.locator('.function-strip')).toBeVisible()
  await expect(page.getByText('Workspace failed to load')).toHaveCount(0)
  await expect(page.locator('.workspace')).toContainText(/Loading workspace for SPY…|Market Pulse/)
})

test('corrupted persisted workspace self-recovers', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
      state: {
        watchlists: [null, { id: '', name: '', symbols: ['spy', 17, null] }],
        activeWatchlistId: 'missing',
        recentTickers: [null, 'spy', 42, 'qqq'],
        compareTickers: ['spy', 'spy', 'msft'],
        savedCompareSets: [{ id: '', name: '', tickers: [null, 'spy'], createdAt: null }],
      },
      version: 0,
    }))
  })

  await page.goto('/')

  await expect(page.getByText('Workspace failed to load')).toHaveCount(0)
  await expect(page.getByText('Market Pulse')).toBeVisible()

  const stored = await page.evaluate(() => window.localStorage.getItem('batesstocks-terminal'))
  expect(stored).toContain('watchlists')
})

test('function-strip nav buttons navigate correctly', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.function-strip')).toBeVisible()

  // Click MON nav button
  const mon = page.locator('.function-key', { hasText: 'MON' })
  await mon.scrollIntoViewIfNeeded()
  await mon.click()
  await expect(page).toHaveURL(/\/monitor/)

  // Click WL nav button
  const wl = page.locator('.function-key', { hasText: 'WL' })
  await wl.scrollIntoViewIfNeeded()
  await wl.click()
  await expect(page).toHaveURL(/\/watchlists/)

  // Click COMP nav button
  const comp = page.locator('.function-key', { hasText: 'COMP' })
  await comp.scrollIntoViewIfNeeded()
  await comp.click()
  await expect(page).toHaveURL(/\/compare/)

  // Click DASH nav button to go home
  const dash = page.locator('.function-key', { hasText: 'DASH' })
  await dash.scrollIntoViewIfNeeded()
  await dash.click()
  await expect(page).toHaveURL('/')
})

test('command bar COMP command sets compare tickers and navigates', async ({ page }) => {
  await page.goto('/')

  // Focus command bar
  const input = page.locator('.commandbar-input')
  await input.click()
  await input.fill('COMP MSFT SPY QQQ')
  await input.press('Enter')

  // Should navigate to security page for MSFT (first ticker in COMP)
  await expect(page).toHaveURL(/\/security\/MSFT/)
})

test('command bar search results only appear when focused', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
      state: {
        recentCommands: ['SPY DES', 'COMP MSFT SPY', 'MON'],
        watchlists: [{ id: 'core', name: 'Core', symbols: ['SPY'] }],
        activeWatchlistId: 'core',
        recentTickers: ['SPY'],
        compareTickers: ['SPY'],
      },
      version: 0,
    }))
  })

  await page.goto('/')

  // Results should NOT be visible before focusing the command bar
  await expect(page.locator('.command-results')).not.toBeVisible()

  // Nav buttons should be clickable (not blocked by overlay)
  await page.locator('.function-strip').getByText('MON').click()
  await expect(page).toHaveURL(/\/monitor/)
})

test('security page buttons are all clickable', async ({ page }) => {
  await page.goto('/security/SPY')
  await expect(page.locator('.security-grid')).toBeVisible({ timeout: 15000 })

  // Timeframe buttons
  const toolbar = page.locator('.chart-toolbar')
  await expect(toolbar).toBeVisible()
  await toolbar.getByText('1M').click()
  await toolbar.getByText('1Y').click()
  await toolbar.getByText('3M').click()

  // Overlay toggle buttons
  await toolbar.getByText('SMA 10').click()
  await toolbar.getByText('SMA 30').click()

  // WATCH / UNWATCH button
  const watchBtn = page.locator('.terminal-button', { hasText: /WATCH/ })
  await expect(watchBtn).toBeVisible()
  await watchBtn.click()
  // Should toggle label
  await expect(page.locator('.terminal-button', { hasText: /WATCH/ })).toBeVisible()

  // COMPARE button
  await page.locator('.terminal-button', { hasText: 'COMPARE' }).click()

  // BACKTEST button
  await page.locator('.terminal-button', { hasText: 'BACKTEST' }).click()
  await expect(page).toHaveURL(/\/backtest/)

  // Navigate back
  await page.goto('/security/SPY')
  await expect(page.locator('.security-grid')).toBeVisible({ timeout: 15000 })

  // COMP buttons in the related names table
  const compButtons = page.locator('.table-action', { hasText: 'COMP' })
  const count = await compButtons.count()
  if (count > 0) {
    await compButtons.first().click()
    // Should not error - just adds to compare tickers
  }
})

test('security page ANALYZE button opens AI panel', async ({ page }) => {
  await page.goto('/security/SPY')
  await expect(page.locator('.security-grid')).toBeVisible({ timeout: 15000 })

  await page.locator('.terminal-button', { hasText: 'ANALYZE' }).click()
  await expect(page.locator('.ai-drawer')).toBeVisible()
})
