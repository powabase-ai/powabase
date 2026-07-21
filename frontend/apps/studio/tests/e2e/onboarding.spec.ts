import { expect, test } from '@playwright/test'

// The shared E2E_TEST_USER already has at least one org from prior
// project-creation tests, so the signup-survey gate treats them as a
// pre-launch exempt candidate. The frontend fires the exempt mutation
// automatically on first /organizations visit — after which subsequent
// navigations should pass through cleanly.
//
// NOTE: this suite cannot exercise the fresh-user happy path (zero orgs,
// complete the 5-question wizard, land on /new) because the studio's
// Playwright harness shares a single authenticated user across all specs.
// That path is covered by:
//   - pytest tests in test_signup_survey_routes.py (state machine)
//   - pytest tests in test_signup_survey_org_hook.py (org-create stamp)
//   - manual smoke verification before merge

test.describe('signup-survey gate (shared E2E user)', () => {
  test('user with existing orgs is not bounced from /organizations to /onboarding', async ({ page }) => {
    await page.goto('/organizations')
    // The exempt mutation may fire silently in the background, but the URL
    // should never become /onboarding for a user with existing memberships.
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/\/onboarding/)
  })

  test('visiting /onboarding as a completed/exempt user redirects to /organizations', async ({ page }) => {
    // First trip to /organizations triggers the auto-exempt mutation so the
    // server-side row is in place.
    await page.goto('/organizations')
    await page.waitForLoadState('networkidle')

    // Now /onboarding should detect 'pass' (or 'auto-exempt' which also
    // redirects) and bounce us back.
    await page.goto('/onboarding')
    await page.waitForURL((url) => !url.pathname.startsWith('/onboarding'), { timeout: 10000 })
  })
})
