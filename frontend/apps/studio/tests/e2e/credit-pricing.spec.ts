import { test, expect } from '@playwright/test'

// Auth is handled globally via auth.setup.ts + storageState — no per-test sign-in needed.

const ORG_SLUG = process.env.E2E_ORG_SLUG || 'test-org'

test.describe('Pricing catalog page', () => {
  test('renders all 24 catalog rows', async ({ page }) => {
    await page.goto(`/org/${ORG_SLUG}/credits/pricing`)
    const rows = page.getByRole('row')
    // 24 catalog rows + 1 header row
    await expect(rows).toHaveCount(25)
  })

  test('sortable by cost', async ({ page }) => {
    await page.goto(`/org/${ORG_SLUG}/credits/pricing`)
    // Default sort is ascending — capture the lowest-cost row first.
    const beforeClick = await page.getByRole('row').nth(1).locator('td').nth(1).textContent()
    await page.getByRole('columnheader', { name: 'Cost' }).click()
    // After a single click the table flips to descending, so the first
    // body row becomes the highest-cost action (web_search_deep, 8000 millicents = $0.08).
    const afterClick = await page.getByRole('row').nth(1).locator('td').nth(1).textContent()
    expect(afterClick).not.toBe(beforeClick)
    expect(afterClick).toContain('$0.08 per call')
  })

  test('hash deep-link scrolls to action row', async ({ page }) => {
    // Force a short viewport so the table can't fit all 24 rows above
    // the fold — otherwise `toBeInViewport` would pass even without
    // any scrolling happening, defeating the test.
    await page.setViewportSize({ width: 1024, height: 400 })
    // Target web_search_deep ($0.08, highest cost) — guaranteed
    // last row in the default ascending-by-cost sort, so scroll MUST happen.
    await page.goto(`/org/${ORG_SLUG}/credits/pricing#web_search_deep`)
    const row = page.locator('#web_search_deep')
    await expect(row).toBeInViewport()
    const scrollY = await page.evaluate(() => window.scrollY)
    expect(scrollY).toBeGreaterThan(0)
  })
})
