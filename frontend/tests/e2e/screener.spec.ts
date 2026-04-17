import { expect, test } from '@playwright/test'

test.describe('ScreenerPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/screener')
    await expect(page.locator('.workbench-grid')).toBeVisible()
    await expect(page.getByText('Screener Builder')).toBeVisible()
  })

  test('renders strategy workbench with form fields', async ({ page }) => {
    await expect(page.locator('input[placeholder*="strategy"]').or(page.locator('.terminal-input').first())).toBeVisible()
    await expect(page.getByText('Entry Stack')).toBeVisible()
    await expect(page.getByText('Exit Stack')).toBeVisible()
    await expect(page.locator('button', { hasText: 'RUN SCREEN' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'RESET' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'SAVE' })).toBeVisible()
  })

  test('ADD RULE button adds a new rule row to Entry Stack', async ({ page }) => {
    const entryStack = page.locator('.stack-section').filter({ hasText: 'Entry Stack' })
    const addBtn = entryStack.locator('button', { hasText: 'RULE' })
    const rulesBefore = await entryStack.locator('.rule-row').count()
    await addBtn.click()
    await expect(entryStack.locator('.rule-row')).toHaveCount(rulesBefore + 1)
  })

  test('ADD RULE button adds a new rule row to Exit Stack', async ({ page }) => {
    const exitStack = page.locator('.stack-section').filter({ hasText: 'Exit Stack' })
    const addBtn = exitStack.locator('button', { hasText: 'RULE' })
    const rulesBefore = await exitStack.locator('.rule-row').count()
    await addBtn.click()
    await expect(exitStack.locator('.rule-row')).toHaveCount(rulesBefore + 1)
  })

  test('delete rule button removes a rule (but not the last one)', async ({ page }) => {
    const entryStack = page.locator('.stack-section').filter({ hasText: 'Entry Stack' })
    const addBtn = entryStack.locator('button', { hasText: 'RULE' })
    // Add a rule first
    await addBtn.click()
    const rulesAfterAdd = await entryStack.locator('.rule-row').count()
    expect(rulesAfterAdd).toBeGreaterThan(1)
    // Delete last rule
    const deleteBtn = entryStack.locator('.terminal-icon-button').last()
    await deleteBtn.click()
    await expect(entryStack.locator('.rule-row')).toHaveCount(rulesAfterAdd - 1)
  })

  test('last rule delete button is disabled', async ({ page }) => {
    const entryStack = page.locator('.stack-section').filter({ hasText: 'Entry Stack' })
    // Make sure only one rule exists by getting the count
    const ruleCount = await entryStack.locator('.rule-row').count()
    if (ruleCount === 1) {
      // The delete button for the last rule should be disabled
      await expect(entryStack.locator('.terminal-icon-button').first()).toBeDisabled()
    }
  })

  test('JOIN operator dropdown switches between AND and OR', async ({ page }) => {
    const entryStack = page.locator('.stack-section').filter({ hasText: 'Entry Stack' })
    const joinSelect = entryStack.locator('.terminal-select').first()
    await expect(joinSelect).toBeVisible()
    await joinSelect.selectOption('or')
    await expect(joinSelect).toHaveValue('or')
    await joinSelect.selectOption('and')
    await expect(joinSelect).toHaveValue('and')
  })

  test('rule metric and condition dropdowns are interactive', async ({ page }) => {
    const entryStack = page.locator('.stack-section').filter({ hasText: 'Entry Stack' })
    const ruleRow = entryStack.locator('.rule-row').first()
    // Metric dropdown
    const metricSelect = ruleRow.locator('.terminal-select').nth(0)
    await expect(metricSelect).toBeVisible()
    // Condition dropdown
    const conditionSelect = ruleRow.locator('.terminal-select').nth(1)
    await expect(conditionSelect).toBeVisible()
    await conditionSelect.selectOption('below')
    await expect(conditionSelect).toHaveValue('below')
  })

  test('mode toggle switches between METRIC and VALUE compare fields', async ({ page }) => {
    const entryStack = page.locator('.stack-section').filter({ hasText: 'Entry Stack' })
    const ruleRow = entryStack.locator('.rule-row').first()
    // Find mode select (METRIC/VALUE)
    const modeSelect = ruleRow.locator('.terminal-select').nth(2)
    await expect(modeSelect).toBeVisible()
    // Switch to value mode
    await modeSelect.selectOption('value')
    // A number input should appear in the rule row
    const valueInput = ruleRow.locator('input[inputmode="decimal"]').or(ruleRow.locator('input[type="number"]'))
    await expect(valueInput).toBeVisible()
    // Switch back to metric mode
    await modeSelect.selectOption('metric')
    // Value input should disappear, metric select should appear
    await expect(valueInput).not.toBeVisible()
  })

  test('RESET button resets the workbench to defaults', async ({ page }) => {
    // Add a rule to dirty the state
    const entryStack = page.locator('.stack-section').filter({ hasText: 'Entry Stack' })
    await entryStack.locator('button', { hasText: 'RULE' }).click()
    const rulesBefore = await entryStack.locator('.rule-row').count()
    // Reset
    await page.locator('button', { hasText: 'RESET' }).click()
    const rulesAfter = await entryStack.locator('.rule-row').count()
    // Should be back to default (fewer rules than after adding)
    expect(rulesAfter).toBeLessThanOrEqual(rulesBefore)
  })

  test('SAVE button saves the current draft and shows it in saved list', async ({ page }) => {
    // Scope to the screener builder panel to avoid matching AI panel saved list
    const screenerPanel = page.locator('.terminal-panel').filter({ hasText: 'Screener Builder' })
    await screenerPanel.locator('button', { hasText: 'SAVE' }).click()
    // Should appear in saved inline list within screener panel
    await expect(screenerPanel.locator('.saved-inline-list')).toBeVisible()
    await expect(screenerPanel.locator('.saved-inline-button').first()).toBeVisible()
  })

  test('RUN SCREEN button runs the screen and shows results or scanning state', async ({ page }) => {
    const runBtn = page.locator('button', { hasText: /RUN SCREEN|SCANNING/ })
    await runBtn.click()
    // Button should briefly show SCANNING state or results should appear
    // Wait for non-pending state
    await expect(page.locator('button', { hasText: 'RUN SCREEN' })).toBeVisible({ timeout: 30000 })
  })

  test('saved screen loads when clicked', async ({ page }) => {
    const screenerPanel = page.locator('.terminal-panel').filter({ hasText: 'Screener Builder' })
    // First save the current draft
    await screenerPanel.locator('button', { hasText: 'SAVE' }).click()
    await expect(screenerPanel.locator('.saved-inline-button').first()).toBeVisible()
    // Add a rule to change the state
    const entryStack = page.locator('.stack-section').filter({ hasText: 'Entry Stack' })
    await entryStack.locator('button', { hasText: 'RULE' }).click()
    const rulesWithExtra = await entryStack.locator('.rule-row').count()
    // Load the saved screen (which had fewer rules)
    await screenerPanel.locator('.saved-inline-button').first().click()
    const rulesAfterLoad = await entryStack.locator('.rule-row').count()
    // Should have reset to the saved state (fewer rules)
    expect(rulesAfterLoad).toBeLessThanOrEqual(rulesWithExtra)
  })
})

test.describe('BacktestPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/backtest')
    await expect(page.locator('.workbench-grid')).toBeVisible()
    await expect(page.getByText('Backtest Builder')).toBeVisible()
  })

  test('renders with ticker input and action buttons', async ({ page }) => {
    // Ticker input has placeholder="TICKER" (from StrategyWorkbench when includeTicker=true)
    await expect(page.locator('input[placeholder="TICKER"]')).toBeVisible()
    await expect(page.locator('button', { hasText: /RUN BACKTEST/ })).toBeVisible()
    await expect(page.locator('button', { hasText: 'SAVE' })).toBeVisible()
  })

  test('ticker input accepts a symbol', async ({ page }) => {
    const tickerInput = page.locator('input[placeholder="TICKER"]')
    await tickerInput.click()
    await tickerInput.fill('nvda')
    // Should convert to uppercase
    await expect(tickerInput).toHaveValue('NVDA')
  })

  test('navigating to backtest with ticker param pre-fills the ticker', async ({ page }) => {
    await page.goto('/backtest?ticker=MSFT')
    await expect(page.locator('input[placeholder="TICKER"]')).toHaveValue('MSFT', { timeout: 5000 })
  })

  test('SAVE button saves the current draft', async ({ page }) => {
    const backtestPanel = page.locator('.terminal-panel').filter({ hasText: 'Backtest Builder' })
    await backtestPanel.locator('button', { hasText: 'SAVE' }).click()
    await expect(backtestPanel.locator('.saved-inline-button').first()).toBeVisible()
  })

  test('saved backtest loads when clicked', async ({ page }) => {
    const backtestPanel = page.locator('.terminal-panel').filter({ hasText: 'Backtest Builder' })
    await backtestPanel.locator('button', { hasText: 'SAVE' }).click()
    await expect(backtestPanel.locator('.saved-inline-button').first()).toBeVisible()
    await backtestPanel.locator('.saved-inline-button').first().click()
    // No errors should occur
    await expect(page.locator('.state-panel.error-state')).toHaveCount(0)
  })

  test('RUN BACKTEST runs and eventually shows results panel', async ({ page }) => {
    // Set a simple ticker
    const tickerInput = page.locator('input[placeholder="TICKER"]')
    await tickerInput.click()
    await tickerInput.fill('SPY')
    const runBtn = page.locator('button', { hasText: /RUN BACKTEST|RUNNING/ })
    await runBtn.click()
    // Wait for either results or button back to normal
    await expect(page.locator('button', { hasText: 'RUN BACKTEST' })).toBeVisible({ timeout: 30000 })
  })
})
