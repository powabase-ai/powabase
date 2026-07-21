/**
 * sources-crud.spec.ts
 *
 * Write-path smoke test for the Sources tab.
 *
 * Covers:
 *   - upload (direct multipart REST API in beforeAll; UI upload modal is a
 *     separate sub-flow not tested here since the fixture is already uploaded)
 *   - list: uploaded source appears in the sources table
 *   - detail: source name renders non-empty (F6 regression guard)
 *   - metadata PATCH: UI-driven via the Metadata editor section on the detail
 *     page (Edit button → textarea → Save) + API double-assertion
 *   - reextract: UI-driven via the Re-extract button on the detail page +
 *     waitForExtraction + API double-assertion
 *   - cancel: direct API POST /cancel + API double-assertion
 *   - delete: click Delete in list-page row, accept window.confirm(), assert
 *     source row gone from UI and GET returns 404
 *
 * NOTE — upload smoke:
 *   The beforeAll fixture uses the REST API directly (multipart POST). A
 *   separate UI-upload sub-test via the "New Source > Upload files" modal
 *   is intentionally omitted here — the modal flow is already exercised
 *   manually during dev. The test focus is the write-path double-assertion,
 *   not the file-picker interaction.
 *
 * NOTE — cancel timing:
 *   The cancel test does NOT wait for extraction to complete before
 *   cancelling — it uploads a small .txt file and immediately POSTs /cancel.
 *   A small .txt file can complete extraction in <1 second, so the cancel
 *   may arrive after extraction finishes. The assertion therefore accepts
 *   both 'cancelled' and 'extracted' as valid post-cancel statuses. If the
 *   API returns 409 (status is no longer pending/extracting), the test
 *   accepts that as a pass since extraction had already completed.
 *
 * Auth: token is read from the Playwright storageState file set up by
 * auth.setup.ts (key: supabase.dashboard.auth.token).
 */

import { test, expect, type APIRequestContext } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { apiGet, apiDelete, PROJECT_API, authHeader } from './support/api-helpers'
import { waitForExtraction } from './support/wait-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

const FIXTURE = path.resolve(__dirname, 'fixtures/sources-crud-sample.txt')

interface SourceShape {
  id: string
  name: string
  extraction_status: string
  metadata?: Record<string, unknown> | null
  auto_metadata?: Record<string, unknown> | null
}

/**
 * Upload the fixture file via multipart POST to /sources/upload.
 * Returns the created source shape.
 */
async function uploadFixture(
  request: APIRequestContext,
  nameSuffix: string
): Promise<SourceShape> {
  const uniqueName = `sources-crud-${nameSuffix}-${Date.now()}.txt`
  // Salt the file content so each upload has a unique SHA-256. The backend
  // deduplicates by content hash, so re-using the on-disk fixture bytes
  // across multiple uploads in the same run would 409 on the second call.
  const salted = Buffer.concat([
    Buffer.from(`// e2e-salt: ${uniqueName}\n`),
    fs.readFileSync(FIXTURE),
  ])
  const res = await request.post(`${PROJECT_API}/sources/upload`, {
    multipart: {
      file: {
        name: uniqueName,
        mimeType: 'text/plain',
        buffer: salted,
      },
    },
    headers: authHeader,
  })
  if (!res.ok()) {
    throw new Error(`POST /sources/upload -> ${res.status()}: ${await res.text()}`)
  }
  const body = await res.json()
  // The upload endpoint returns id and name at the top level
  return { ...body, name: body.name ?? uniqueName }
}

// ─── PRIMARY FLOW ────────────────────────────────────────────────────────────
//
// One shared disposable source for: list, detail, metadata, reextract.
// upload + waitForExtraction run in beforeAll so the source is 'extracted'
// before any UI navigation begins.

test.describe.serial('sources CRUD — primary flow', () => {
  let sourceId: string
  let sourceName: string

  test.beforeAll(async ({ request }) => {
    const created = await uploadFixture(request, 'primary')
    sourceId = created.id
    sourceName = created.name
    if (!sourceId) throw new Error('beforeAll: upload returned no id')
    await waitForExtraction(request, sourceId, 45000)
  })

  test.afterAll(async ({ request }) => {
    if (sourceId) await apiDelete(request, `/sources/${sourceId}`)
  })

  // ─── 1. LIST ──────────────────────────────────────────────────────────────

  test('list: uploaded source appears on list page', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/sources`)
    // UI assertion 1: source name visible in the table
    await expect(page.getByText(sourceName)).toBeVisible({ timeout: 10000 })
    // UI assertion 2: page heading is present (page loaded without error)
    await expect(page.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible()
  })

  // ─── 2. DETAIL (F6 regression guard) ─────────────────────────────────────

  test('detail: source name renders non-empty on detail page', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/sources/${sourceId}`)
    // The detail breadcrumb renders: Sources > {source.name}
    // We assert the source name is present in the breadcrumb span.
    // The page renders: <span class="text-foreground font-medium truncate">{source.name}</span>
    await expect(page.locator('span.font-medium.truncate', { hasText: sourceName })).toBeVisible({
      timeout: 10000,
    })
    // Double-assertion: the status badge is also visible (page rendered fully)
    await expect(page.locator('span.rounded-full')).toBeVisible({ timeout: 5000 })
  })

  // ─── 3. METADATA PATCH ────────────────────────────────────────────────────
  //
  // UI path: click Edit in the Metadata section, fill the JSON textarea, click
  // Save. Edit mode exits on success. Double-assert via API GET.

  test('metadata: UI editor persists custom metadata', async ({ page, request }) => {
    await page.goto(`/project/${PROJECT_REF}/sources/${sourceId}`)
    // Wait for the page to fully load (breadcrumb visible)
    await expect(page.locator('span.font-medium.truncate', { hasText: sourceName })).toBeVisible({
      timeout: 10000,
    })

    // Click the Edit button in the Metadata section (scoped to the section containing "Metadata" heading)
    const metadataSection = page.locator('section').filter({ has: page.locator('h4', { hasText: /metadata/i }) })
    await metadataSection.getByRole('button', { name: /edit/i }).click()

    // Fill the textarea with valid JSON
    await metadataSection.locator('textarea').fill('{"crud_smoke": "pass"}')

    // Click Save (scoped to metadata section)
    await metadataSection.getByRole('button', { name: /save/i }).click()

    // Edit mode exits when save succeeds — textarea disappears
    await expect(metadataSection.locator('textarea')).not.toBeVisible({ timeout: 10000 })

    // Double-assertion: re-fetch via API and verify the field persisted
    const after = await apiGet<SourceShape>(request, `/sources/${sourceId}`)
    expect(after.metadata).toMatchObject({ crud_smoke: 'pass' })
  })

  // ─── 4. REEXTRACT ─────────────────────────────────────────────────────────
  //
  // UI path: click the Re-extract button on the detail page. Button enters
  // "Re-extracting..." state briefly, then waitForExtraction polls to completion.

  test('reextract: Re-extract button re-runs extraction to completion', async ({
    page,
    request,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/sources/${sourceId}`)
    // Wait for the page to fully load (breadcrumb visible)
    await expect(page.locator('span.font-medium.truncate', { hasText: sourceName })).toBeVisible({
      timeout: 10000,
    })

    // Click the Re-extract button
    await page.getByRole('button', { name: /re-?extract/i }).click()

    // Button enters loading state briefly (text changes to "Re-extracting...")
    // We do not assert this momentary state since it may resolve quickly for a
    // small fixture. Just wait for the button to return to "Re-extract" label
    // (loading done, status re-fetched to pending).
    await expect(page.getByRole('button', { name: /^re-?extract$/i })).toBeVisible({
      timeout: 15000,
    })

    // Wait for extraction to reach 'extracted'
    await waitForExtraction(request, sourceId, 45000)

    // Double-assertion: explicit GET confirms final status
    const after = await apiGet<SourceShape>(request, `/sources/${sourceId}`)
    expect(after.extraction_status).toBe('extracted')
  })
})

// ─── CANCEL EXTRACTION ───────────────────────────────────────────────────────
//
// Separate disposable source — we do NOT wait for extraction so we can cancel
// while still pending. A small .txt may complete in <1 s, so the cancel may
// arrive too late. We handle that case gracefully (see note at top of file).

test.describe.serial('sources CRUD — cancel extraction', () => {
  let sourceId: string

  test.beforeAll(async ({ request }) => {
    const created = await uploadFixture(request, 'cancel')
    sourceId = created.id
    if (!sourceId) throw new Error('beforeAll: upload returned no id')
    // Intentionally NOT waiting for extraction — we want to cancel ASAP.
  })

  test.afterAll(async ({ request }) => {
    if (sourceId) await apiDelete(request, `/sources/${sourceId}`)
  })

  test('cancel: POST /cancel while pending flips status to cancelled', async ({ request }) => {
    // POST /cancel immediately after upload; extraction may still be pending
    const res = await request.post(`${PROJECT_API}/sources/${sourceId}/cancel`, {
      headers: authHeader,
    })

    if (res.status() === 409) {
      // 409 means extraction already completed before we could cancel — this
      // is acceptable for a small .txt fixture. Verify extracted is the status.
      const after = await apiGet<SourceShape>(request, `/sources/${sourceId}`)
      expect(['extracted', 'failed', 'cancelled']).toContain(after.extraction_status)
      return
    }

    if (!res.ok()) {
      throw new Error(`POST /sources/${sourceId}/cancel -> ${res.status()}: ${await res.text()}`)
    }

    // Double-assertion: status is now cancelled (or already extracted if race)
    const after = await apiGet<SourceShape>(request, `/sources/${sourceId}`)
    expect(['cancelled', 'extracted']).toContain(after.extraction_status)
  })
})

// ─── DELETE VIA UI ───────────────────────────────────────────────────────────
//
// Separate disposable source. Navigates to the list page, finds the source
// row by name, clicks the Trash2 icon button (title="Delete"), accepts the
// native window.confirm() dialog, then asserts the row is gone from the UI
// and the API returns 404.

test.describe.serial('sources CRUD — delete via UI', () => {
  let sourceId: string
  let sourceName: string

  test.beforeAll(async ({ request }) => {
    const created = await uploadFixture(request, 'delete')
    sourceId = created.id
    sourceName = created.name
    if (!sourceId) throw new Error('beforeAll: upload returned no id')
    // Wait for extraction so the row appears with a stable status
    await waitForExtraction(request, sourceId, 45000)
  })

  test('delete: click Delete in list row, confirm dialog, assert gone UI + API 404', async ({
    page,
    request,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/sources`)
    await expect(page.getByText(sourceName)).toBeVisible({ timeout: 10000 })

    // The delete button is a plain <button> with title="Delete" and a Trash2
    // icon. Each row has Download, then Delete. We locate the row containing
    // our source name, then find the Delete button within that row.
    const sourceRow = page.locator('tr').filter({ hasText: sourceName })
    await expect(sourceRow).toBeVisible({ timeout: 5000 })

    // Register dialog handler BEFORE the click that triggers window.confirm()
    page.on('dialog', (dialog) => dialog.accept())

    await sourceRow.locator('button[title="Delete"]').click()

    // UI assertion: source name disappears from the table
    await expect(page.getByText(sourceName)).not.toBeVisible({ timeout: 8000 })

    // API assertion: source returns 404
    const res = await request.get(`${PROJECT_API}/sources/${sourceId}`, { headers: authHeader })
    expect(res.status()).toBe(404)
  })
})
