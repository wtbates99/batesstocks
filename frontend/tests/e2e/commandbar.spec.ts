import { expect, test } from '@playwright/test'

test.describe('CommandBar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.commandbar')).toBeVisible()
  })

  test('input is visible with correct placeholder', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('placeholder', /SPY DES/)
  })

  test('Escape key clears the input', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('AAPL')
    await expect(input).toHaveValue('AAPL')
    await input.press('Escape')
    await expect(input).toHaveValue('')
  })

  test('/ hotkey focuses the command bar', async ({ page }) => {
    // Click somewhere that isn't an input to make sure we're not in an input
    await page.locator('.shell-header').click()
    await page.keyboard.press('/')
    await expect(page.locator('.commandbar-input')).toBeFocused()
  })

  test('status shows cyan tone for valid command', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('SPY DES')
    await expect(page.locator('.commandbar-status')).toHaveClass(/tone-cyan/)
    await expect(page.locator('.commandbar-status')).toContainText(/SPY DES/)
  })

  test('status shows warning tone for unrecognized input', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('XXXXXXXXXXXXXXX INVALID')
    await expect(page.locator('.commandbar-status')).toHaveClass(/tone-warning/)
  })

  test('hints panel appears on focus when command bar is empty', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await expect(page.locator('.commandbar-hints')).not.toBeVisible()
    await input.click()
    await expect(page.locator('.commandbar-hints')).toBeVisible()
  })

  test('hint chips are visible and execute commands when clicked', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.click()
    await expect(page.locator('.commandbar-hints')).toBeVisible()
    // Click MON hint
    await page.locator('.hint-chip', { hasText: 'MON' }).click()
    await expect(page).toHaveURL(/\/monitor/)
  })

  test('recent commands appear in results when input is empty and focused', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
        state: {
          recentCommands: ['SPY DES', 'COMP MSFT SPY'],
          watchlists: [{ id: 'core', name: 'Core', symbols: ['SPY'] }],
          activeWatchlistId: 'core',
          recentTickers: ['SPY'],
          compareTickers: ['SPY'],
        },
        version: 0,
      }))
    })
    await page.goto('/')
    const input = page.locator('.commandbar-input')
    // Click to focus — recentCommands are shown in .command-results when empty+focused
    await input.click()
    await expect(page.locator('.command-results')).toBeVisible()
    await expect(page.locator('.command-result', { hasText: 'SPY DES' })).toBeVisible()
  })

  test('command results hidden when input loses focus', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
        state: {
          recentCommands: ['SPY DES'],
          watchlists: [{ id: 'core', name: 'Core', symbols: ['SPY'] }],
          activeWatchlistId: 'core',
          recentTickers: ['SPY'],
          compareTickers: ['SPY'],
        },
        version: 0,
      }))
    })
    await page.goto('/')
    const input = page.locator('.commandbar-input')
    await input.click()
    await expect(page.locator('.command-results')).toBeVisible()
    // Click elsewhere to blur
    await page.locator('.brand-mark').click()
    await expect(page.locator('.command-results')).not.toBeVisible()
  })

  test('ArrowDown/Up navigates recent command result list', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('batesstocks-terminal', JSON.stringify({
        state: {
          recentCommands: ['SPY DES', 'QQQ DES', 'NVDA DES'],
          watchlists: [{ id: 'core', name: 'Core', symbols: ['SPY'] }],
          activeWatchlistId: 'core',
          recentTickers: ['SPY'],
          compareTickers: ['SPY'],
        },
        version: 0,
      }))
    })
    await page.goto('/')
    const input = page.locator('.commandbar-input')
    await input.click()
    await expect(page.locator('.command-result').first()).toBeVisible()
    // First result should be active
    const firstResult = page.locator('.command-result').first()
    await expect(firstResult).toHaveClass(/is-active/)
    // Arrow down to second
    await input.press('ArrowDown')
    await expect(page.locator('.command-result').nth(1)).toHaveClass(/is-active/)
    // Arrow up back to first
    await input.press('ArrowUp')
    await expect(firstResult).toHaveClass(/is-active/)
  })

  test('Enter on a ticker symbol navigates to security page', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('SPY')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/security\/SPY/)
  })

  test('MON command navigates to monitor page', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('MON')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/monitor/)
  })

  test('WL command navigates to watchlists page', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('WL')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/watchlists/)
  })

  test('EQS command navigates to screener page', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('EQS')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/screener/)
  })

  test('PORT command navigates to backtest page', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('PORT')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/backtest/)
  })

  test('NEWS command navigates to news page', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('NEWS')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/news/)
  })

  test('WL ADD command adds ticker to watchlist', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('WL ADD TSLA')
    await input.press('Enter')
    // Should clear input and show notice
    await expect(input).toHaveValue('')
    // Notice should appear in status strip
    await expect(page.locator('.status-notice')).toContainText(/WATCH|TSLA/)
  })

  test('AI command opens AI panel', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('AI what is the market doing')
    await input.press('Enter')
    await expect(page.locator('.ai-drawer.is-open')).toBeVisible()
  })

  test('HELP command shows help notice', async ({ page }) => {
    const input = page.locator('.commandbar-input')
    await input.fill('HELP')
    await input.press('Enter')
    await expect(page.locator('.status-notice')).toContainText(/MON|WL|COMP/)
  })
})
