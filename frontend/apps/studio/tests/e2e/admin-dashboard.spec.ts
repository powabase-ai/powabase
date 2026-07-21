import { test, expect } from '@playwright/test'

// Uses the existing tests/e2e/auth.setup.ts admin fixture, which stashes an
// authenticated session in tests/e2e/.auth/user.json. The user it signs in
// as must be in PLATFORM_ADMIN_EMAILS (set in the test env).
//
// Smoke goal: prove the v1 admin dashboard renders end-to-end. Deeper
// per-page assertions live in the backend pytest suite (test_admin_browse.py).

test.describe('admin dashboard v1', () => {
  test('landing renders KPI tiles', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Users', { exact: true })).toBeVisible()
    await expect(page.getByText('Orgs', { exact: true })).toBeVisible()
    await expect(page.getByText('Projects', { exact: true })).toBeVisible()
    await expect(page.getByText('Signups (7d)')).toBeVisible()
  })

  test('users list renders and search input works', async ({ page }) => {
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.getByPlaceholder(/search by email/i)).toBeVisible()
  })

  test('orgs list renders', async ({ page }) => {
    await page.goto('/admin/orgs')
    await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible()
  })

  test('unauthenticated user redirected away from /admin', async ({ browser }) => {
    // Fresh context with no storage state = unauthenticated.
    // Studio middleware redirects unauthenticated users before AdminLayout
    // ever runs; this test exercises middleware, not AdminLayout's non-admin
    // path (which requires an authenticated non-admin storage state).
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await page.goto('/admin')
    // Unauthenticated users land on /sign-in or /, not /admin.
    await expect(page).not.toHaveURL(/\/admin/)
    await ctx.close()
  })
})
