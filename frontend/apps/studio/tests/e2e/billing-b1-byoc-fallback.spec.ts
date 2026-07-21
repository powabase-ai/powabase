import { test, expect } from '@playwright/test'

/**
 * BYOC fallback test: when enabled-features.json sets billing:all=false
 * (BYOC operator's pre-deploy override), the Billing settings tab renders
 * PartnerManagedResource and hides UpgradePlanPicker / ManageSubscriptionPanel.
 *
 * Pre-conditions:
 *  - A second Studio instance running with NEXT_PUBLIC_ENABLED_FEATURES override
 *    setting "billing:all": false. Or the test stack runs with an env-var that
 *    flips the feature flag client-side.
 *
 * NOTE: This test only runs in CI when E2E_BILLING_DISABLED_FIXTURE=1 is set.
 */
test.skip(
  () => process.env.E2E_BILLING_DISABLED_FIXTURE !== '1',
  'requires the billing:all=false Studio fixture',
)

test('BYOC operator sees PartnerManagedResource when billing:all=false', async ({ page }) => {
  await page.goto('/sign-in')
  await page.fill('input[name="email"]', 'e2e-byoc@test.local')
  await page.fill('input[name="password"]', process.env.E2E_PASSWORD || 'changeme')
  await page.click('button[type="submit"]')

  await page.goto('/org/e2e-byoc-org/billing')
  await expect(page.locator('text=Available plans')).not.toBeVisible()
  await expect(page.locator('text=Manage subscription')).not.toBeVisible()
  // PartnerManagedResource component shows the words "managed by" + the partner display name
  await expect(page.locator('text=/managed by/i')).toBeVisible()
})
