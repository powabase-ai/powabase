import { test as setup, expect } from '@playwright/test'

const authFile = 'tests/e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set')
  }

  await page.goto('/sign-in')
  await page.waitForLoadState('domcontentloaded')
  await page.getByLabel(/email/i).waitFor({ timeout: 10000 })
  await page.getByLabel(/email/i).fill(email)
  await page.locator('input[name="password"]').fill(password)

  // Wait for the hCaptcha SDK to finish loading. Without this, the
  // sign-in submit races with @hcaptcha/react-hcaptcha's internal
  // `this.hcaptcha` initialisation and throws "Cannot read properties
  // of undefined (reading 'execute')" — reproducible in Playwright
  // because headless doesn't throttle; a real human always waits long
  // enough to fill a password form that the SDK is ready.
  await page.waitForFunction(
    () => typeof (window as unknown as { hcaptcha?: unknown }).hcaptcha !== 'undefined',
    null,
    { timeout: 10000 }
  )

  // Submit the form directly — avoids nextjs-portal overlay blocking button clicks
  await page.locator('form#sign-in-form').evaluate((form: HTMLFormElement) => {
    form.requestSubmit()
  })

  // Wait for redirect away from sign-in
  await expect(page).not.toHaveURL(/sign-in/, { timeout: 15000 })

  // Save auth state
  await page.context().storageState({ path: authFile })
})
