import path from 'path'
import { config as loadEnv } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

loadEnv({ path: path.resolve(__dirname, '.env.test') })

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8082'
const authFile = path.resolve(__dirname, 'tests/e2e/.auth/user.json')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
  ],
  timeout: 90000,
})
