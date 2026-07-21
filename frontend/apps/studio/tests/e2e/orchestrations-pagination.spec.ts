/**
 * orchestrations-pagination.spec.ts
 *
 * Verifies the paginated + virtualized orchestrations list page:
 *   - header shows total count
 *   - infinite scroll loads next page
 *   - search filters server-side
 *   - inline create panel toggles
 *
 * Seeds 60 orchestrations via REST API; cleans up in afterAll.
 *
 * Note: /api/orchestrations preserves an unparameterized back-compat
 * default (returns all rows, no pagination keys). The Studio list page
 * sends limit/offset, so pagination is exercised here.
 */

import { test, expect } from '@playwright/test'
import { apiPost, apiDelete } from './support/api-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

const SEED_COUNT = 60
const NAME_PREFIX = `pgtest-orch-${Date.now()}`

test.describe.serial('Orchestrations pagination', () => {
  const seededIds: string[] = []

  test.beforeAll(async ({ request }) => {
    for (let i = 0; i < SEED_COUNT; i++) {
      const created = await apiPost<{ id: string }>(request, '/orchestrations', {
        name: `${NAME_PREFIX}-${i.toString().padStart(3, '0')}`,
        strategy: 'supervisor',
      })
      if (!created.id) throw new Error(`beforeAll: orchestration seed ${i} returned no id`)
      seededIds.push(created.id)
    }
  })

  test.afterAll(async ({ request }) => {
    for (const id of seededIds) {
      try {
        await apiDelete(request, `/orchestrations/${id}`)
      } catch {
        // best-effort cleanup
      }
    }
  })

  test('header reports total count', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations`)
    await expect(page.getByRole('heading', { name: 'Orchestrations', exact: true })).toBeVisible()
    await expect(page.getByText(/\d+ total · \d+ loaded/)).toBeVisible({ timeout: 10000 })
  })

  test('infinite scroll loads more rows', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations`)
    const subline = page.getByText(/\d+ total · \d+ loaded/)
    await expect(subline).toBeVisible({ timeout: 10000 })

    const readLoaded = async (): Promise<number> => {
      const text = await subline.textContent()
      const match = text?.match(/(\d+)\s*total\s*·\s*(\d+)\s*loaded/)
      if (!match) throw new Error(`subline did not match expected shape: ${text}`)
      return Number(match[2])
    }
    const before = await readLoaded()

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="orchestrations-list-scroll"]') as HTMLElement | null
      if (el) el.scrollTo(0, el.scrollHeight)
    })

    // Loaded count must increase after scroll and exceed first page size.
    await expect.poll(readLoaded, { timeout: 10000 }).toBeGreaterThan(before)
    expect(await readLoaded()).toBeGreaterThan(50)
  })

  test('search filters server-side', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations`)
    await expect(page.getByText(/total/)).toBeVisible({ timeout: 10000 })
    await page.getByPlaceholder('Search by name...').fill(NAME_PREFIX)
    await page.waitForTimeout(800)
    await expect(page.getByText(new RegExp(`^${SEED_COUNT} total`))).toBeVisible({ timeout: 5000 })
  })

  test('inline create panel toggles open then closes after Cancel', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations`)
    await page.getByRole('button', { name: /Create orchestration/ }).click()
    await expect(page.getByText('Create Orchestration')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Create Orchestration')).not.toBeVisible()
  })
})
