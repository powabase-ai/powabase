import { test, expect } from '@playwright/test'

// Auth is handled globally via auth.setup.ts + storageState — no per-test sign-in needed.

const ORG_SLUG = process.env.E2E_ORG_SLUG || 'test-org'

test.describe('Top-header credit bar', () => {
  test('renders the credit balance (free plan: balance only, no cap)', async ({ page }) => {
    await page.goto(`/org/${ORG_SLUG}`)
    const bar = page.getByTestId('credit-bar')
    await expect(bar).toBeVisible()
    // Free plan is a one-time, non-refilling credit (migration 0014): the bar
    // shows the balance alone via formatBillingAmount() — no monthly cap and
    // no "this month". Regex so the assertion doesn't depend on seed amounts.
    await expect(bar).toContainText(/\$[\d.]+/)
    await expect(bar).not.toContainText(/ of \$/)
    await expect(bar).not.toContainText('this month')
  })

  test('hover shows a non-expiry tooltip (no reset for free plan)', async ({ page }) => {
    await page.goto(`/org/${ORG_SLUG}`)
    const bar = page.getByTestId('credit-bar')
    await bar.hover()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText(/doesn't expire/)
    await expect(tooltip).not.toContainText(/Resets in/)
  })

  test('click navigates to /org/<slug>/usage', async ({ page }) => {
    await page.goto(`/org/${ORG_SLUG}`)
    await page.getByTestId('credit-bar').click()
    await expect(page).toHaveURL(new RegExp(`/org/${ORG_SLUG}/usage`))
  })

  test('renders em-dash placeholder on fetch error', async ({ page }) => {
    // Intercept the limits endpoint and return 500. The bar reads
    // everything from /credits/limits (one round-trip); see CreditBar.tsx.
    await page.route('**/platform/organizations/*/credits/limits', (route) =>
      route.fulfill({ status: 500, body: 'down' })
    )
    await page.goto(`/org/${ORG_SLUG}`)
    await expect(page.getByTestId('credit-bar')).toContainText('—')
  })
})
