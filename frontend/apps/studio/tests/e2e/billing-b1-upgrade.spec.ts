import { test, expect } from '@playwright/test'

/**
 * E2E: Free user clicks Subscribe on the Self-Serve card.
 *
 * Pre-conditions:
 *  - Studio dev stack running on http://localhost:8082
 *  - Test user `e2e-free@test.local` with org `e2e-free-org` on the Free plan
 *  - Stripe test mode active (STRIPE_SECRET_KEY=sk_test_...)
 *  - Tests use Stripe's test-card flow on checkout.stripe.com
 */
test('free user can click Subscribe and lands on Stripe Checkout', async ({ page }) => {
  await page.goto('/sign-in')
  await page.fill('input[name="email"]', 'e2e-free@test.local')
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD || 'changeme')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/org\/.*\/?$/)

  await page.goto('/org/e2e-free-org/billing')
  await page.waitForSelector('text=Available plans')
  await expect(page.locator('text=Self-Serve')).toBeVisible()
  await expect(page.locator('text=$150/mo')).toBeVisible()

  const responsePromise = page.waitForResponse(/billing\/checkout-session/)
  await page.getByRole('button', { name: /Subscribe/ }).first().click()
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.url).toContain('checkout.stripe.com')

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 10_000 })
  expect(page.url()).toContain('checkout.stripe.com')
})
