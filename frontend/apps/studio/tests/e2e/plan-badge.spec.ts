import { test, expect } from '@playwright/test'

// Auth is handled globally via auth.setup.ts + storageState — no per-test sign-in needed.

// Plan badge surfaces a capitalized plan_id from build_org_response (Task 6 +
// migration 0008): every org has a plan_id, defaulting to 'free'. The badge
// is part of the core org payload, NOT gated on credits:enabled — non-Powabase
// forks still surface the plan tier.
const KNOWN_PLANS = ['Free', 'Pro', 'Team', 'Enterprise']

test.describe('Plan badge in organization card', () => {
  test('renders plan badge with capitalized plan_id in org selector', async ({ page }) => {
    // The org selector is used in the project claim flow
    // We can test by navigating to the claim page and checking the organization list
    const claimUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001')
    claimUrl.pathname = '/claim'

    await page.goto(claimUrl.toString())

    // Wait for organizations to load
    const planBadge = page.getByTestId('plan-badge').first()

    // Badge should be visible whenever the org has a plan_id (always-true
    // post-Task-6 + migration 0008).
    await expect(planBadge).toBeVisible()

    // Verify the text matches a known plan tier (capitalized).
    const badgeText = (await planBadge.textContent())?.trim()
    expect(KNOWN_PLANS).toContain(badgeText)
  })

  test('plan badge shows the correct plan tier', async ({ page }) => {
    const claimUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001')
    claimUrl.pathname = '/claim'

    await page.goto(claimUrl.toString())

    // Get all plan badges
    const badges = page.getByTestId('plan-badge')

    // Iterate through visible badges and verify they contain valid plan names
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const badge = badges.nth(i)
      const text = (await badge.textContent())?.trim()
      expect(KNOWN_PLANS).toContain(text)
    }
  })
})
