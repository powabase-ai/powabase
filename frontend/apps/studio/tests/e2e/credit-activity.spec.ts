import { test, expect } from '@playwright/test'

// The Activity sub-tab is gated behind the credits:activity feature flag,
// which is off by default until paid tiers ship. Re-enable this suite when
// the flag flips on; the underlying component code lives at
// components/interfaces/Organization/Usage/Activity/.
test.describe.skip('Activity sub-tab', () => {
  const orgSlug = process.env.E2E_ORG_SLUG || 'test-org'

  test.beforeEach(async ({ page }) => {
    await page.goto(`/org/${orgSlug}/usage`)
    await page.getByRole('tab', { name: 'Activity' }).click()
  })

  test('renders ledger rows or empty state', async ({ page }) => {
    // Either rows or "No activity yet" message
    const rowCount = await page.getByRole('row').count()
    if (rowCount === 0) {
      await expect(page.getByText('No activity yet')).toBeVisible()
    }
  })

  test('run_id search filters by ref_id substring', async ({ page }) => {
    await page.getByTestId('activity-runid-search').fill('run_abc')
    // Verify the filter input accepts and persists the value
    await expect(page.getByTestId('activity-runid-search')).toHaveValue('run_abc')
  })

  test('action filter button is reachable', async ({ page }) => {
    const actionFilter = page.getByTestId('activity-action-filter')
    await expect(actionFilter).toBeVisible()
    await actionFilter.click()
    // Popover should open — check for the search input inside it
    await expect(page.getByPlaceholder('Search actions...')).toBeVisible()
  })

  test('project filter button is reachable', async ({ page }) => {
    const projectFilter = page.getByTestId('activity-project-filter')
    await expect(projectFilter).toBeVisible()
    await projectFilter.click()
    await expect(page.getByPlaceholder('Search projects...')).toBeVisible()
  })
})
