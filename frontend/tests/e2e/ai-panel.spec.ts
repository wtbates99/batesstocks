import { expect, test } from '@playwright/test'

test.describe('AiPanel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.workspace')).toBeVisible()
  })

  test('AI panel is closed by default', async ({ page }) => {
    await expect(page.locator('.ai-drawer')).not.toHaveClass(/is-open/)
  })

  test('AI button in header opens the panel', async ({ page }) => {
    await page.locator('.terminal-button-ghost', { hasText: 'AI' }).click()
    await expect(page.locator('.ai-drawer')).toHaveClass(/is-open/)
  })

  test('Ctrl+` hotkey toggles the AI panel open and closed', async ({ page }) => {
    // Open
    await page.keyboard.press('Control+`')
    await expect(page.locator('.ai-drawer')).toHaveClass(/is-open/)
    // Close
    await page.keyboard.press('Control+`')
    await expect(page.locator('.ai-drawer')).not.toHaveClass(/is-open/)
  })

  test('AI panel shows suggestion buttons when empty', async ({ page }) => {
    await page.locator('.terminal-button-ghost', { hasText: 'AI' }).click()
    await expect(page.locator('.ai-drawer.is-open')).toBeVisible()
    // Suggestions are shown when there are no messages
    await expect(page.locator('.ai-drawer .saved-inline-button').first()).toBeVisible({ timeout: 5000 })
  })

  test('clicking a suggestion populates the input', async ({ page }) => {
    await page.locator('.terminal-button-ghost', { hasText: 'AI' }).click()
    await expect(page.locator('.ai-drawer.is-open')).toBeVisible()
    const suggestion = page.locator('.ai-drawer .saved-inline-button').first()
    await expect(suggestion).toBeVisible({ timeout: 5000 })
    const suggestionText = await suggestion.textContent()
    await suggestion.click()
    // Input should be filled or message should be sent
    // Either the textarea has the text or messages started appearing
    const textarea = page.locator('.ai-drawer .terminal-textarea')
    const messages = page.locator('.ai-drawer .chat-role')
    // One of these should reflect the action
    const hasText = await textarea.inputValue()
    const messageCount = await messages.count()
    expect(hasText.length > 0 || messageCount > 0).toBeTruthy()
    expect(suggestionText).toBeTruthy()
  })

  test('SEND button is disabled when textarea is empty', async ({ page }) => {
    await page.locator('.terminal-button-ghost', { hasText: 'AI' }).click()
    await expect(page.locator('.ai-drawer.is-open')).toBeVisible()
    const textarea = page.locator('.ai-drawer .terminal-textarea')
    await textarea.fill('')
    await expect(page.locator('.ai-drawer .terminal-button', { hasText: 'SEND' })).toBeDisabled()
  })

  test('SEND button is enabled when textarea has text', async ({ page }) => {
    await page.locator('.terminal-button-ghost', { hasText: 'AI' }).click()
    await expect(page.locator('.ai-drawer.is-open')).toBeVisible()
    const textarea = page.locator('.ai-drawer .terminal-textarea')
    await textarea.fill('What is SPY doing today?')
    await expect(page.locator('.ai-drawer .terminal-button', { hasText: 'SEND' })).toBeEnabled()
  })

  test('Shift+Enter adds a newline without submitting', async ({ page }) => {
    await page.locator('.terminal-button-ghost', { hasText: 'AI' }).click()
    await expect(page.locator('.ai-drawer.is-open')).toBeVisible()
    const textarea = page.locator('.ai-drawer .terminal-textarea')
    await textarea.fill('Line one')
    await textarea.press('Shift+Enter')
    const value = await textarea.inputValue()
    expect(value).toContain('\n')
  })

  test('AI panel shows context label matching current page', async ({ page }) => {
    await page.goto('/security/SPY')
    await expect(page.locator('.security-grid')).toBeVisible({ timeout: 15000 })
    await page.locator('button', { hasText: 'ANALYZE' }).click()
    await expect(page.locator('.ai-drawer.is-open')).toBeVisible()
    // Context label should mention SECURITY or SPY
    await expect(page.locator('.ai-drawer')).toContainText(/SECURITY|SPY/)
  })

  test('ANALYZE from security page opens AI with pre-filled prompt', async ({ page }) => {
    await page.goto('/security/SPY')
    await expect(page.locator('.security-grid')).toBeVisible({ timeout: 15000 })
    await page.locator('button', { hasText: 'ANALYZE' }).click()
    await expect(page.locator('.ai-drawer.is-open')).toBeVisible()
    // The pre-filled prompt should appear in the textarea
    const textarea = page.locator('.ai-drawer .terminal-textarea')
    const value = await textarea.inputValue()
    expect(value).toContain('SPY')
  })
})
