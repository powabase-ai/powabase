/**
 * knowledge-bases-crud.spec.ts
 *
 * Write-path smoke test for the Knowledge Bases tab.
 *
 * Covers:
 *   - create KB (direct API in beforeAll; the UI creation modal is a separate
 *     sub-flow not tested here — the focus is the write-path double-assertion)
 *   - upload a source + wait for extraction
 *   - add source to KB + wait for indexing
 *   - list: KB visible on list page
 *   - detail: KB name renders (F6 regression guard)
 *   - chunks: click "View indexed data" on the indexed source row; assert real
 *     chunk content visible, no "undefined", no "404" banner (Pattern C guard)
 *   - delete: click Delete on KB list row, confirm dialog, assert gone UI + API 404
 *
 * The chunks-tab assertion is the main regression guard for Plan 07's Pattern C
 * refactor of issue #81's 7 broken reads — it must show real chunk rows, not
 * "undefined" or 404 banners.
 *
 * Auth: token read from Playwright storageState (key: supabase.dashboard.auth.token).
 */

import fs from 'fs'
import path from 'path'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { apiPost, apiGet, apiDelete, PROJECT_API, authHeader } from './support/api-helpers'
import { waitForExtraction } from './support/wait-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

const FIXTURE = path.resolve(__dirname, 'fixtures/sources-crud-sample.txt')

interface KB {
  id: string
  name: string
  indexing_config?: Record<string, unknown>
}

interface KBDetail extends KB {
  indexed_sources?: Array<{ id: string; source_id: string; index_status: string }>
}

interface SourceShape {
  id: string
  name: string
  extraction_status: string
}

/**
 * Upload the fixture file via multipart POST to /sources/upload.
 * Returns the created source shape.
 */
async function uploadFixture(
  request: APIRequestContext,
  nameSuffix: string
): Promise<SourceShape> {
  const uniqueName = `kb-crud-${nameSuffix}-${Date.now()}.txt`
  // Salt content so each upload has a unique SHA-256 (the backend dedups by
  // content hash; re-using the on-disk fixture bytes would 409 on retries).
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
  return { ...body, name: body.name ?? uniqueName }
}

/**
 * Poll /knowledge-bases/:kbId until the indexed_source entry reaches 'indexed'.
 * Throws on 'failed' or timeout.
 */
async function waitForIndexing(
  request: APIRequestContext,
  kbId: string,
  indexedSourceId: string,
  timeoutMs = 60000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const kb = await apiGet<KBDetail>(request, `/knowledge-bases/${kbId}`)
    const row = (kb.indexed_sources || []).find((s) => s.id === indexedSourceId)
    if (row?.index_status === 'indexed') return
    if (row?.index_status === 'failed') {
      throw new Error(`Indexing failed for indexed_source ${indexedSourceId}`)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  const kb = await apiGet<KBDetail>(request, `/knowledge-bases/${kbId}`)
  const row = (kb.indexed_sources || []).find((s) => s.id === indexedSourceId)
  throw new Error(
    `Indexing timed out after ${timeoutMs}ms for ${indexedSourceId} (final status: ${row?.index_status ?? 'unknown'})`
  )
}

// ─── PRIMARY FLOW ─────────────────────────────────────────────────────────────

test.describe.serial('knowledge-bases CRUD — primary flow', () => {
  let kbId: string
  let kbName: string
  let sourceId: string
  let indexedSourceId: string

  test.beforeAll(async ({ request }) => {
    kbName = `crud-kb-${Date.now()}`

    // 1. Create KB via direct API (clean setup path; UI modal tested separately)
    const kb = await apiPost<KB>(request, '/knowledge-bases', {
      name: kbName,
      description: 'Plan 07 CRUD smoke',
      indexing_config: {
        strategy: 'chunk_embed',
        chunk_size: 1000,
        chunk_overlap: 100,
        embedding_model: 'text-embedding-3-small',
      },
      retrieval_config: { method: 'hybrid', top_k: 5 },
    })
    kbId = kb.id

    // 2. Upload a source and wait for extraction
    const created = await uploadFixture(request, 'primary')
    sourceId = created.id
    await waitForExtraction(request, sourceId, 45000)

    // 3. Add source to KB → triggers indexing
    const added = await apiPost<{ id: string }>(request, `/knowledge-bases/${kbId}/sources`, {
      source_id: sourceId,
    })
    indexedSourceId = added.id

    // 4. Wait for indexing to complete so chunk rows are populated
    await waitForIndexing(request, kbId, indexedSourceId)
  })

  test.afterAll(async ({ request }) => {
    // kbId may be cleared by the delete test; only delete if still set
    if (kbId) await apiDelete(request, `/knowledge-bases/${kbId}`)
    if (sourceId) await apiDelete(request, `/sources/${sourceId}`)
  })

  // ─── 1. LIST ────────────────────────────────────────────────────────────────

  test('list: KB visible on list page after creation', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/knowledge-bases`)
    await expect(page.getByText(kbName)).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByRole('heading', { name: 'Knowledge Bases', exact: true })
    ).toBeVisible()
  })

  // ─── 2. DETAIL (F6 regression guard) ────────────────────────────────────────

  test('detail: KB name renders non-empty on detail page (F6 regression guard)', async ({
    page,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/knowledge-bases/${kbId}`)
    // <h1 class="text-2xl font-semibold text-foreground">{kb.name}</h1>
    await expect(page.getByRole('heading', { level: 1, name: kbName })).toBeVisible({
      timeout: 10000,
    })
  })

  // ─── 3. CHUNKS TAB (Pattern C guard — issue #81) ─────────────────────────────
  //
  // The indexed source row on the detail page has a "View indexed data" button
  // (aria-label="View indexed data", title="View indexed data"). Clicking it opens
  // a Dialog containing chunk rows for chunk_embed strategy. After the Pattern C
  // refactor these were read via PostgREST direct (useProjectSupabaseClient);
  // as of C2.1 they're read via kbInspectorApi.listChunks() -> project-service
  // GET /api/knowledge-bases/<kb_id>/indexed-sources/<id>/chunks instead (same
  // rendered shape, different transport). The critical assertion is that chunk
  // text is non-empty and no "undefined" or "404" leak into the dialog.

  test('chunks: "View indexed data" dialog shows real chunks (Pattern C guard)', async ({
    page,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/knowledge-bases/${kbId}`)

    // Wait for the page to fully load
    await expect(page.getByRole('heading', { level: 1, name: kbName })).toBeVisible({
      timeout: 10000,
    })

    // The sources section renders a row per indexed source. The inspect button
    // is: <button title="View indexed data" aria-label="View indexed data">
    const inspectBtn = page.getByRole('button', { name: 'View indexed data' }).first()
    await expect(inspectBtn).toBeVisible({ timeout: 10000 })
    await inspectBtn.click()

    // Wait for the Dialog to open — DialogTitle begins with "Chunks: "
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })

    // Wait for chunks to load (spinner goes away, content appears)
    // The dialog shows a spinner while loading, then either a <ul> of chunks or
    // a "No chunks" message. We wait until the spinner is gone.
    const spinner = page.locator('[role="dialog"] .animate-spin')
    await spinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {
      // If spinner never appeared (fast load), that's fine
    })

    const dialogContent = await page.locator('[role="dialog"]').innerText()

    // POSITIVE ASSERTIONS (Pattern C + Content-Range forwarding guards):
    //
    // A real indexed .txt fixture produces >=1 chunk. The chunk row renders
    // "Chunk 0" (or "Chunk 1", etc.) — a literal label followed by the index.
    // Pre-fix: either no chunks renderd at all (the whole map() was empty
    // because supabase-js returned null `data`) OR content-range stripping
    // caused the chunks list to show "No chunks for this source." Either
    // outcome fails this assertion.
    expect(
      dialogContent,
      'chunks dialog must contain at least one "Chunk <index>" row (Pattern C + Content-Range forwarding guard)'
    ).toMatch(/Chunk\s+\d+/)

    // The chunk text from the fixture (sources-crud-sample.txt) starts with
    // "Sample text document for sources CRUD smoke." — assert that actual
    // chunk CONTENT renders, not just the label.
    expect(
      dialogContent,
      'chunks dialog must contain real chunk text from the indexed source'
    ).toContain('Sample text document')

    // NEGATIVE ASSERTIONS (catch regressions we've already hit):
    expect(
      dialogContent,
      'chunks dialog must not contain "Chunk undefined" (Pattern C field-access regression)'
    ).not.toMatch(/Chunk\s+undefined/i)
    expect(
      dialogContent,
      'chunks dialog must not show "No chunks" when the source IS indexed (Content-Range stripping regression)'
    ).not.toContain('No chunks for this source')
    expect(
      dialogContent,
      'chunks dialog must not show a 404 error banner'
    ).not.toMatch(/\b404\b.*(Not Found|Error)/i)

    // Existing positive: dialog title includes "Chunks:" for chunk_embed strategy
    expect(dialogContent, 'dialog title must include "Chunks:"').toContain('Chunks:')

    // Close the dialog
    const closeBtn = page.locator('[role="dialog"]').getByRole('button', { name: /close/i })
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
  })

  // ─── 4. DELETE VIA UI ───────────────────────────────────────────────────────

  test('delete: click Delete on KB list row, confirm dialog, assert gone UI + API 404', async ({
    page,
    request,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/knowledge-bases`)
    await expect(page.getByText(kbName)).toBeVisible({ timeout: 10000 })

    // The delete button is: <button title="Delete"> with a trash SVG icon.
    // Each row has View (eye icon) + Delete (trash icon).
    // We locate the row containing our KB name, then find the Delete button.
    const kbRow = page.locator('tr').filter({ hasText: kbName })
    await expect(kbRow).toBeVisible({ timeout: 5000 })

    // Register dialog handler BEFORE the click that triggers window.confirm()
    page.on('dialog', (dialog) => dialog.accept())

    await kbRow.locator('button[title="Delete"]').click()

    // UI assertion: KB name disappears from the table
    await expect(page.getByText(kbName)).not.toBeVisible({ timeout: 8000 })

    // API assertion: KB returns 404
    const res = await request.get(`${PROJECT_API}/knowledge-bases/${kbId}`, {
      headers: authHeader,
    })
    expect(res.status()).toBe(404)

    // Prevent afterAll from double-deleting (already gone)
    kbId = ''
  })
})
