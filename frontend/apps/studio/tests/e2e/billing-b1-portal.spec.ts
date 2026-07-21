import { test, expect } from '@playwright/test'

/**
 * Pre-conditions:
 *  - Test user `e2e-self-serve@test.local` already on Self-Serve plan
 *    (manually subscribed once via Stripe test mode, fixture preserved)
 */
test('self-serve user opens Stripe Customer Portal', async ({ page }) => {
  await page.goto('/sign-in')
  await page.fill('input[name="email"]', 'e2e-self-serve@test.local')
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD || 'changeme')
  await page.click('button[type="submit"]')

  await page.goto('/org/e2e-self-serve-org/billing')
  await page.waitForSelector('text=Subscription')
  await expect(page.locator('text=Self-Serve')).toBeVisible()
  await expect(page.getByRole('button', { name: /Manage subscription/ })).toBeVisible()

  const responsePromise = page.waitForResponse(/billing\/portal-session/)
  await page.getByRole('button', { name: /Manage subscription/ }).click()
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.url).toContain('billing.stripe.com')

  await page.waitForURL(/billing\.stripe\.com/, { timeout: 10_000 })
})
