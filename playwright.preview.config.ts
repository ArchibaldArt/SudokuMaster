import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

const deployedUrl = process.env.SUDOKU_DEPLOY_URL
const previewUrl = `http://127.0.0.1:4173${process.env.SUDOKU_BASE_PATH || '/'}`

export default defineConfig({
  ...base,
  outputDir: 'test-results/production',
  use: { ...base.use, baseURL: deployedUrl || previewUrl },
  projects: [
    {
      name: 'production',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(?:app|photo|camera)\.spec\.ts/,
      grep: /solves 9|clean printed|captures, retakes/,
    },
    {
      name: 'production-mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec\.ts/,
      grep: /photo recognition actions/,
    },
  ],
  webServer: deployedUrl
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: previewUrl,
        reuseExistingServer: false,
        timeout: 30_000,
      },
})
