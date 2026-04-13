import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:18000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'AUTO_SYNC_ON_START=false AUTO_SYNC_SCHEDULED=false .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 18000',
    cwd: '..',
    url: 'http://127.0.0.1:18000/health/ready',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
})
