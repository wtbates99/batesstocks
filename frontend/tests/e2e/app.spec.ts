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
