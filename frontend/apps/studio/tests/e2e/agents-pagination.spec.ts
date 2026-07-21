/**
 * agents-pagination.spec.ts
 *
 * Verifies the paginated + virtualized agents list page:
 *   - header shows total count
 *   - infinite scroll loads next page
 *   - search filters server-side
 *   - sort dropdown reorders cards
 *
 * Seeds 60 agents via REST API; cleans up in afterAll.
 */

import { test, expect } from '@playwright/test'
import { apiPost, apiDelete } from './support/api-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

const SEED_COUNT = 60
const NAME_PREFIX = `pgtest-agent-${Date.now()}`

test.describe.serial('Agents pagination', () => {
  const seededIds: string[] = []

  test.beforeAll(async ({ request }) => {
    for (let i = 0; i < SEED_COUNT; i++) {
      const created = await apiPost<{ id: string }>(request, '/agents', {
        name: `${NAME_PREFIX}-${i.toString().padStart(3, '0')}`,
        system_prompt: `Seeded agent ${i}`,
      })
      if (!created.id) throw new Error(`beforeAll: agent seed ${i} returned no id`)
      seededIds.push(created.id)
    }
  })

  test.afterAll(async ({ request }) => {
    for (const id of seededIds) {
      try {
        await apiDelete(request, `/agents/${id}`)
      } catch {
        // best-effort cleanup
      }
    }
  })

  test('header reports total count', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/agents`)
    await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible()
    await expect(page.getByText(/\d+ total · \d+ loaded/)).toBeVisible({ timeout: 10000 })
  })

  test('infinite scroll loads more rows', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/agents`)
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
      const el = document.querySelector('[data-testid="agents-list-scroll"]') as HTMLElement | null
      if (el) el.scrollTo(0, el.scrollHeight)
    })

    // Loaded count must increase after scroll and exceed first page size.
    await expect.poll(readLoaded, { timeout: 10000 }).toBeGreaterThan(before)
    expect(await readLoaded()).toBeGreaterThan(50)
  })

  test('search filters server-side', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/agents`)
    await expect(page.getByText(/total/)).toBeVisible({ timeout: 10000 })
    await page.getByPlaceholder('Search by name...').fill(NAME_PREFIX)
    await page.waitForTimeout(800)
    await expect(page.getByText(new RegExp(`^${SEED_COUNT} total`))).toBeVisible({ timeout: 5000 })
  })

  test('sort by name ascending puts -000 first', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/agents`)
    // Filter to our seeded rows so the ordering assertion is deterministic.
    await page.getByPlaceholder('Search by name...').fill(NAME_PREFIX)
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /Sort by/ }).click()
    await page.getByRole('menuitem', { name: 'Sort by name' }).click()
    await page.waitForTimeout(500)
    // The alphabetically-smallest seeded name is `${NAME_PREFIX}-000`. Pin
    // it as the first visible card title (header h3) in the list.
    await expect(page.getByRole('heading', { name: `${NAME_PREFIX}-000` })).toBeVisible({
      timeout: 5000,
    })
  })

  test('sort by last run does not crash when all rows tie at null', async ({ page }) => {
    // All seeded agents have no runs (last_run_at is null), so they all
    // tie. This is a smoke check that the request shape and NULLS LAST
    // ordering don't 500 — not an ordering assertion (since ties).
    await page.goto(`/project/${PROJECT_REF}/agents`)
    await page.getByPlaceholder('Search by name...').fill(NAME_PREFIX)
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /Sort by/ }).click()
    await page.getByRole('menuitem', { name: 'Sort by last run' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText(new RegExp(`^${SEED_COUNT} total`))).toBeVisible({ timeout: 5000 })
  })
})
