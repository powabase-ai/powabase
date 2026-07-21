import { test, expect, type Page } from '@playwright/test'
import { apiGet } from './support/api-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

interface ApiFailure {
  url: string
  status: number
  method: string
}

const ignoredPatterns = [
  '/telemetry/',
  '/feature-flags',
  '/notifications',
  'favicon',
  '/_next/',
  'hot-update',
]

/**
 * Start capturing failed API responses AND runtime JS errors on a page.
 * Call before navigating. Returns functions to get failures collected so far.
 */
function startCapturingFailures(page: Page): { getApiFailures: () => ApiFailure[]; getPageErrors: () => string[] } {
  const failures: ApiFailure[] = []
  const pageErrors: string[] = []

  page.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    const method = response.request().method()

    if (!url.includes('/api/')) return
    if (ignoredPatterns.some((p) => url.includes(p))) return
    if (method === 'OPTIONS') return

    if (status >= 400) {
      failures.push({ url, status, method })
    }
  })

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  return {
    getApiFailures: () => [...failures],
    getPageErrors: () => [...pageErrors],
  }
}

function formatFailures(failures: ApiFailure[]): string {
  return failures
    .map((f) => `  ${f.method} ${f.status} ${f.url}`)
    .join('\n')
}

interface PageResult {
  apiFailures: ApiFailure[]
  pageErrors: string[]
  skipped?: boolean
}

/**
 * Navigate to a page, wait for it to settle, return all API failures AND runtime JS errors.
 */
async function collectPageProblems(page: Page, path: string): Promise<PageResult> {
  const { getApiFailures, getPageErrors } = startCapturingFailures(page)

  await page.goto(path)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)

  return { apiFailures: getApiFailures(), pageErrors: getPageErrors() }
}

/**
 * Navigate to a list page, find a detail link, navigate to it.
 * Captures API failures AND runtime JS errors from BOTH pages.
 */
async function collectDetailPageProblems(
  page: Page,
  listPath: string,
  linkSelector: string
): Promise<PageResult> {
  const { getApiFailures, getPageErrors } = startCapturingFailures(page)

  await page.goto(listPath)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)

  const link = page.locator(linkSelector).first()
  const href = await link.getAttribute('href', { timeout: 5000 }).catch(() => null)

  if (!href) {
    return { apiFailures: getApiFailures(), pageErrors: getPageErrors(), skipped: true }
  }

  await page.goto(href)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)

  return { apiFailures: getApiFailures(), pageErrors: getPageErrors() }
}

function assertNoProblems(result: PageResult, name: string) {
  if (result.apiFailures.length > 0) {
    expect(result.apiFailures, `Failed API requests on ${name}:\n${formatFailures(result.apiFailures)}`).toHaveLength(0)
  }
  if (result.pageErrors.length > 0) {
    expect(result.pageErrors, `Runtime JS errors on ${name}:\n  ${result.pageErrors.join('\n  ')}`).toHaveLength(0)
  }
}

// === List pages ===

const listPages = [
  { name: 'Agents list', path: `/project/${PROJECT_REF}/agents` },
  { name: 'Knowledge Bases list', path: `/project/${PROJECT_REF}/knowledge-bases` },
  { name: 'Sources list', path: `/project/${PROJECT_REF}/sources` },
  { name: 'Workflows list', path: `/project/${PROJECT_REF}/workflows` },
  { name: 'Runs', path: `/project/${PROJECT_REF}/runs` },
  { name: 'Orchestrations list', path: `/project/${PROJECT_REF}/orchestrations` },
  { name: 'Settings — Copilot', path: `/project/${PROJECT_REF}/settings/copilot` },
  { name: 'Settings — Agents Tools', path: `/project/${PROJECT_REF}/settings/agents-tools` },
  { name: 'Settings — Knowledge Indexing', path: `/project/${PROJECT_REF}/settings/knowledge-indexing` },
  { name: 'Settings — Knowledge Retrieval', path: `/project/${PROJECT_REF}/settings/knowledge-retrieval` },
]

for (const { name, path } of listPages) {
  test(`${name} — no API failures or runtime errors`, async ({ page }) => {
    const result = await collectPageProblems(page, path)
    assertNoProblems(result, name)
  })
}

// === Detail pages ===
//
// Each entry optionally carries an `integritySelector` — a CSS/role selector
// for a heading or label that must be non-empty after navigation.  This
// catches F6-class silent failures: when PostgREST returns an array instead
// of a single object (.single() regression), entity.name === undefined and
// the heading renders empty.  The existing "no API failures / no JS errors"
// gate was blind to this because the GET still returns 200 and nothing throws.
//
// Affected pages (all use .single() through the proxy):
//   - agents/[agent_id].tsx:42    — <h1> renders agent.name
//   - knowledge-bases/[kb_id].tsx:279,502 — <h1> renders kb.name
//   - sources/[source_id].tsx:61  — breadcrumb <span> renders source.name
//   - workflows/[workflow_id].tsx:125 — <h1> renders workflow.name
//
// Orchestrations/[orch_id].tsx also uses <h1> for the name (does not use
// .single() per audit, but same defensive shape check added for consistency).
//
// Fixed by commit 529e54da (proxy now forwards Accept header).  These
// assertions would have failed pre-fix; they serve as regression insurance.

interface DetailPageEntry {
  name: string
  listPath: string
  linkSelector: string
  /** Selector for the heading/title element that must render a non-empty entity name. */
  integritySelector?: string
  /** CSS selector variant when role-based selector is insufficient. */
  integritySelectorCSS?: string
}

const detailPages: DetailPageEntry[] = [
  {
    name: 'Agent detail',
    listPath: `/project/${PROJECT_REF}/agents`,
    linkSelector: 'a[href*="/agents/"]',
    integritySelector: 'h1',
  },
  {
    name: 'KB detail',
    listPath: `/project/${PROJECT_REF}/knowledge-bases`,
    linkSelector: 'a[href*="/knowledge-bases/"]',
    integritySelector: 'h1',
  },
  {
    // Source detail has no <h1>; the entity name is in a breadcrumb <span>.
    name: 'Source detail',
    listPath: `/project/${PROJECT_REF}/sources`,
    linkSelector: 'a[href*="/sources/"]',
    integritySelectorCSS: 'span.text-foreground.font-medium',
  },
  {
    name: 'Workflow detail',
    listPath: `/project/${PROJECT_REF}/workflows`,
    linkSelector: 'a[href*="/workflows/"]',
    integritySelector: 'h1',
  },
  {
    name: 'Orchestration detail',
    listPath: `/project/${PROJECT_REF}/orchestrations`,
    linkSelector: 'a[href*="/orchestrations/"]',
    integritySelector: 'h1',
  },
]

for (const { name, listPath, linkSelector, integritySelector, integritySelectorCSS } of detailPages) {
  test(`${name} — no API failures or runtime errors`, async ({ page }) => {
    const result = await collectDetailPageProblems(page, listPath, linkSelector)
    assertNoProblems(result, name)

    if (result.skipped) {
      test.skip(true, `No ${name.toLowerCase()} found in project — skipping detail test`)
      return
    }

    // ── Integrity assertion: heading/title must render a non-empty entity name ──
    // This catches F6-class bugs where .single() returns an array, entity.name
    // is undefined, and the heading silently renders empty.
    if (integritySelector) {
      const heading = page.locator(integritySelector).first()
      await expect(heading, `${name}: heading must be visible (F6 regression check)`).toBeVisible({ timeout: 5000 })
      const headingText = await heading.textContent()
      expect(headingText?.trim(), `${name}: heading must have non-empty text — entity.name is likely undefined (F6 regression)`).toBeTruthy()
    } else if (integritySelectorCSS) {
      const el = page.locator(integritySelectorCSS).first()
      await expect(el, `${name}: name element must be visible (F6 regression check)`).toBeVisible({ timeout: 5000 })
      const elText = await el.textContent()
      expect(elText?.trim(), `${name}: name element must have non-empty text — entity.name is likely undefined (F6 regression)`).toBeTruthy()
    }
  })
}

// === Rendering integrity: Settings (SettingsForm) — Plan 08 guard ===
//
// The 3 settings tabs (copilot, knowledge-indexing, knowledge-retrieval) were
// audited as "correct Pages Router port" with 3 nits each (F1/F2/F3 = use-client
// removed, layout wrapper added, SettingsForm import path migrated). Static
// inspection cannot catch the KB-detail-h0 class of bug where the DOM is
// present but visually blank due to layout-wrapper height collapse.
//
// This test asserts each settings page actually renders at least one form
// control (input/select/textarea). Zero controls = blank page = real finding,
// not a passing nit.

test.describe('Settings — SettingsForm rendering integrity', () => {
  const settingsPages = [
    { name: 'copilot', path: `/project/${PROJECT_REF}/settings/copilot` },
    { name: 'knowledge-indexing', path: `/project/${PROJECT_REF}/settings/knowledge-indexing` },
    { name: 'knowledge-retrieval', path: `/project/${PROJECT_REF}/settings/knowledge-retrieval` },
  ]
  for (const { name, path } of settingsPages) {
    test(`Settings ${name} — SettingsForm renders with input fields (not blank)`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1000)

      const content = await page.locator('body').innerText()

      expect(content, `Settings ${name} must not show 404 banner`).not.toMatch(
        /\b404\b.*(Not Found|Error)/i
      )
      expect(
        content,
        `Settings ${name} must not contain literal "undefined" in rendered labels`
      ).not.toMatch(/:\s*undefined/i)

      const formControls = await page.locator('input, select, textarea').count()
      expect(
        formControls,
        `Settings ${name} must render at least one form control — zero indicates the page body is blank (see KB-detail h-0 bug precedent)`
      ).toBeGreaterThan(0)
    })
  }
})

// === Rendering integrity: KB Detail (Pattern C guard / F6 guard) ===
//
// Inspect rendered innerText for forbidden substrings rather than only
// checking API status codes.
//
// Catches the class of bug where Pattern C refactored reads return cleanly
// (200 OK) but the FE still renders "undefined" because the shape was
// mis-typed or the query returned a different structure than expected.
//
// Also guards against the F6 regression (.single() returning an array,
// kb.name === undefined, heading renders empty) on the detail page.

test('KB Detail — detail page renders non-empty KB name (Pattern C / F6 regression guard)', async ({
  page,
  request,
}) => {
  const { knowledge_bases } = await apiGet<{ knowledge_bases: Array<{ id: string; name: string }> }>(
    request,
    '/knowledge-bases'
  )
  if (!knowledge_bases.length) {
    test.info().annotations.push({
      type: 'skip',
      description: 'No KBs in project; skipping KB detail integrity',
    })
    return
  }

  const kb = knowledge_bases[0]
  await page.goto(`/project/${PROJECT_REF}/knowledge-bases/${kb.id}`)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)

  const content = await page.locator('body').innerText()

  // KB name must actually render (not empty heading from a .single() shape bug)
  expect(content, 'KB detail must render the KB name').toContain(kb.name)

  // Forbidden — Pattern C returns data cleanly or errors visibly; never "undefined"
  expect(
    content,
    'must not show literal "undefined" in rendered output'
  ).not.toMatch(/[:>\s]undefined[<\s]/i)

  // Forbidden — the 7 old endpoints returned 404; post-fix they should succeed
  // silently or show an empty state, never a "404 Not Found" banner
  expect(
    content,
    'must not show 404 banner from broken detail-page reads'
  ).not.toMatch(/\b404\b.*(Not Found|Error)/i)
})
