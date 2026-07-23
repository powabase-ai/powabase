import { defineConfig, devices } from '@playwright/test'

// Separate Playwright config for the OSS single-project stack
// (docker-compose.yml, NEXT_PUBLIC_IS_PLATFORM=false).
//
// Deliberately NOT merged into playwright.config.ts: that config's `setup`
// project signs in via /sign-in against a control-plane-backed org/project
// (PLAYWRIGHT_BASE_URL defaults to :3001, IS_PLATFORM=true) — a GoTrue
// session flow that doesn't apply here. The OSS stack has no control plane;
// Studio is gated by Kong's `dashboard` route basic-auth (DASHBOARD_USERNAME/
// DASHBOARD_PASSWORD, see volumes/api/kong.yml), not a login page.
const baseURL = process.env.PLAYWRIGHT_OSS_BASE_URL || 'http://localhost:8000'
const username = process.env.OSS_DASHBOARD_USERNAME
const password = process.env.OSS_DASHBOARD_PASSWORD

if (!username || !password) {
  throw new Error(
    'OSS_DASHBOARD_USERNAME and OSS_DASHBOARD_PASSWORD must be set to run this suite — ' +
      'export the DASHBOARD_USERNAME/DASHBOARD_PASSWORD values gen-keys.py wrote to ' +
      '.env under those names.'
  )
}

export default defineConfig({
  testDir: './tests/e2e-oss',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL,
    httpCredentials: { username, password },
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  timeout: 90000,
})
