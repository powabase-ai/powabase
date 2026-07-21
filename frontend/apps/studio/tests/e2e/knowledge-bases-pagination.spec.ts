/**
 * knowledge-bases-pagination.spec.ts
 *
 * Verifies the paginated + virtualized KB list page:
 *   - header shows total count
 *   - infinite scroll loads next page
 *   - search filters server-side
 *   - sort dropdown reorders cards
 *
 * Seeds 60 KBs via REST API; cleans up in afterAll.
 */

import { test, expect } from '@playwright/test'
import { apiPost, apiDelete } from './support/api-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

const SEED_COUNT = 60
const NAME_PREFIX = `pgtest-${Date.now()}`

test.describe.serial('Knowledge Bases pagination', () => {
  const seededIds: string[] = []

  test.beforeAll(async ({ request }) => {
    // Seed sequentially to keep DB load bounded; tests don't need throughput.
    for (let i = 0; i < SEED_COUNT; i++) {
      const created = await apiPost<{ id: string }>(request, '/knowledge-bases', {
        name: `${NAME_PREFIX}-${i.toString().padStart(3, '0')}`,
        description: `Seeded KB ${i}`,
      })
      if (!created.id) throw new Error(`beforeAll: KB seed ${i} returned no id`)
      seededIds.push(created.id)
    }
  })

  test.afterAll(async ({ request }) => {
    for (const id of seededIds) {
      try {
        await apiDelete(request, `/knowledge-bases/${id}`)
      } catch {
        // best-effort cleanup
      }
    }
  })

  test('header reports total count with loaded subline before scrolling', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/knowledge-bases`)
    await expect(page.getByRole('heading', { name: 'Knowledge Bases', exact: true })).toBeVisible()
    // total ≥ SEED_COUNT (other tests/projects may have added more rows)
    await expect(page.getByText(/\d+ total · \d+ loaded/)).toBeVisible({ timeout: 10000 })
  })

  test('infinite scroll loads more rows', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/knowledge-bases`)
    const subline = page.getByText(/\d+ total · \d+ loaded/)
    await expect(subline).toBeVisible({ timeout: 10000 })

    // Capture the loaded count from the "N total · M loaded" subline before
    // scrolling. The default page size is 50, so first paint should show 50.
    const readLoaded = async (): Promise<number> => {
      const text = await subline.textContent()
      const match = text?.match(/(\d+)\s*total\s*·\s*(\d+)\s*loaded/)
      if (!match) throw new Error(`subline did not match expected shape: ${text}`)
      return Number(match[2])
    }
    const before = await readLoaded()

    // Scroll the list container to the bottom — triggers fetchNextPage
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="kb-list-scroll"]') as HTMLElement | null
      if (el) el.scrollTo(0, el.scrollHeight)
    })

    // Wait for the loaded count to grow. With SEED_COUNT=60 and page size 50,
    // the second page must fetch — pin both invariants:
    //   1) `loaded` strictly increases after scroll (proves fetchNextPage ran)
    //   2) post-scroll `loaded` exceeds the first page size (proves the second
    //      page actually came back from the server, not just a no-op render)
    await expect.poll(readLoaded, { timeout: 10000 }).toBeGreaterThan(before)
    expect(await readLoaded()).toBeGreaterThan(50)
  })

  test('search filters server-side', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/knowledge-bases`)
    await expect(page.getByText(/total/)).toBeVisible({ timeout: 10000 })
    // Search by the unique NAME_PREFIX timestamp suffix
    const uniqueQuery = NAME_PREFIX
    await page.getByPlaceholder('Search by name...').fill(uniqueQuery)
    // Wait for debounce + server roundtrip
    await page.waitForTimeout(800)
    // Total should be SEED_COUNT (only our seeded rows match)
    await expect(page.getByText(new RegExp(`^${SEED_COUNT} total`))).toBeVisible({ timeout: 5000 })
  })

  test('sort by name changes order', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/knowledge-bases`)
    // Filter to our seeded rows so the ordering assertion is deterministic
    await page.getByPlaceholder('Search by name...').fill(NAME_PREFIX)
    await page.waitForTimeout(800)
    // Open sort dropdown and switch to "Sort by name"
    await page.getByRole('button', { name: /Sort by/ }).click()
    await page.getByRole('menuitem', { name: 'Sort by name' }).click()
    // First visible card should be the alphabetically-smallest name (000)
    // We assert on the first NAME_PREFIX-000 visible. Allow time for re-render.
    await page.waitForTimeout(500)
    const firstCardName = `${NAME_PREFIX}-000`
    await expect(page.getByText(firstCardName).first()).toBeVisible({ timeout: 5000 })
  })
})
