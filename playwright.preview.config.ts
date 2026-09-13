import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  outputDir: 'test-results/production',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4173' },
  projects: [
    {
      name: 'production',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(?:app|photo)\.spec\.ts/,
      grep: /solves 9|clean printed/,
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
