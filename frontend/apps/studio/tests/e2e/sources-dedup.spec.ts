/**
 * sources-dedup.spec.ts
 *
 * E2E coverage for content-hash duplicate detection.
 *
 * Covers (REST-driven):
 *   - first upload returns 201, second upload of identical bytes returns 409
 *     with {error: "duplicate_source", duplicate: {<existing-source row>}}.
 *
 * Covers (UI-driven):
 *   - DuplicateSourceDialog appears when an in-app upload hits a duplicate.
 *   - "Open existing source" navigates to /project/<ref>/sources/<id>.
 *   - "Cancel" closes the dialog and leaves the list view.
 *
 * Auth: token comes from the storageState set up by auth.setup.ts.
 */

import { test, expect, type APIRequestContext } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { apiDelete, PROJECT_API, authHeader } from './support/api-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

const FIXTURE = path.resolve(__dirname, 'fixtures/sources-crud-sample.txt')

interface SourceShape {
  id: string
  name: string | null
  extraction_status: string | null
}

interface DuplicateResponseShape {
  error: string
  message: string
  duplicate: SourceShape
}

/**
 * Upload the fixture file via multipart POST to /sources/upload.
 * Returns the created source shape (201).
 * Throws on any non-2xx response.
 */
async function uploadFixture(
  request: APIRequestContext,
  filename: string
): Promise<SourceShape> {
  const res = await request.post(`${PROJECT_API}/sources/upload`, {
    multipart: {
      file: {
        name: filename,
        mimeType: 'text/plain',
        buffer: fs.readFileSync(FIXTURE),
      },
    },
    headers: authHeader,
  })
  if (!res.ok()) {
    throw new Error(`POST /sources/upload -> ${res.status()}: ${await res.text()}`)
  }
  const body = await res.json()
  return { ...body, name: body.name ?? filename }
}

async function uploadFixtureRaw(
  request: APIRequestContext,
  filename: string
): Promise<{ status: number; body: unknown }> {
  const res = await request.post(`${PROJECT_API}/sources/upload`, {
    multipart: {
      file: {
        name: filename,
        mimeType: 'text/plain',
        buffer: fs.readFileSync(FIXTURE),
      },
    },
    headers: authHeader,
  })
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = await res.text()
  }
  return { status: res.status(), body }
}

/**
 * Upload the fixture with a unique salt prepended to the bytes, so the
 * content hash differs from the raw fixture. Used to create a second
 * distinct existing source for multi-duplicate tests.
 */
async function uploadSaltedFixture(
  request: APIRequestContext,
  filename: string,
  salt: string
): Promise<SourceShape> {
  const buffer = Buffer.concat([
    Buffer.from(`// e2e-salt: ${salt}\n`),
    fs.readFileSync(FIXTURE),
  ])
  const res = await request.post(`${PROJECT_API}/sources/upload`, {
    multipart: {
      file: {
        name: filename,
        mimeType: 'text/plain',
        buffer,
      },
    },
    headers: authHeader,
  })
  if (!res.ok()) {
    throw new Error(`POST /sources/upload (salted) -> ${res.status()}: ${await res.text()}`)
  }
  const body = await res.json()
  return { ...body, name: body.name ?? filename }
}

/**
 * Delete any leftover rows from previous interrupted runs that share the
 * same raw fixture bytes (their content hash would collide with our first
 * upload and cause beforeAll to 409). Catches all dedup-spec rows regardless
 * of which describe block created them.
 */
async function cleanupStaleDedupRows(request: APIRequestContext): Promise<void> {
  try {
    const list = await request.get(`${PROJECT_API}/sources?limit=100`, {
      headers: authHeader,
    })
    if (!list.ok()) return
    const body = (await list.json()) as { sources: SourceShape[] }
    for (const s of body.sources ?? []) {
      if ((s.name ?? '').startsWith('dedup-')) {
        await apiDelete(request, `/sources/${s.id}`).catch(() => {})
      }
    }
  } catch {
    /* ignore — best effort */
  }
}

// ─── REST CONTRACT ──────────────────────────────────────────────────────────

test.describe.serial('sources dedup — REST contract', () => {
  let firstSourceId: string

  test.beforeAll(async ({ request }) => {
    await cleanupStaleDedupRows(request)

    const created = await uploadFixture(request, `dedup-rest-${Date.now()}.txt`)
    firstSourceId = created.id
    if (!firstSourceId) throw new Error('beforeAll: first upload returned no id')
  })

  test.afterAll(async ({ request }) => {
    if (firstSourceId) await apiDelete(request, `/sources/${firstSourceId}`).catch(() => {})
  })

  test('second upload of identical bytes returns 409 with duplicate body', async ({
    request,
  }) => {
    const { status, body } = await uploadFixtureRaw(request, `dedup-rest-second-${Date.now()}.txt`)
    expect(status).toBe(409)
    const dup = body as DuplicateResponseShape
    expect(dup.error).toBe('duplicate_source')
    expect(dup.duplicate?.id).toBe(firstSourceId)
    // content_hash must be omitted from the duplicate body
    expect((dup.duplicate as unknown as Record<string, unknown>).content_hash).toBeUndefined()
  })
})

// ─── UI FLOW ────────────────────────────────────────────────────────────────

test.describe.serial('sources dedup — UI dialog', () => {
  let firstSourceId: string
  let firstSourceName: string
  let secondSourceId: string
  let secondSourceName: string
  let secondSaltedFixturePath: string

  test.beforeAll(async ({ request }) => {
    await cleanupStaleDedupRows(request)

    // First existing source: the raw fixture bytes.
    const created = await uploadFixture(request, `dedup-ui-${Date.now()}.txt`)
    firstSourceId = created.id
    firstSourceName = created.name ?? ''
    if (!firstSourceId) throw new Error('beforeAll: upload returned no id')

    // Second existing source: same fixture salted with a unique header.
    // Used by the multi-duplicate test below — both files will be uploaded
    // via the UI and both should be detected as duplicates.
    const salt = `multi-${Date.now()}`
    const saltedFixturePath = path.resolve(__dirname, `fixtures/dedup-ui-salted-${salt}.txt`)
    fs.writeFileSync(
      saltedFixturePath,
      Buffer.concat([
        Buffer.from(`// e2e-salt: ${salt}\n`),
        fs.readFileSync(FIXTURE),
      ]),
    )
    secondSaltedFixturePath = saltedFixturePath

    const createdSalted = await uploadSaltedFixture(
      request,
      `dedup-ui-salted-${Date.now()}.txt`,
      salt,
    )
    secondSourceId = createdSalted.id
    secondSourceName = createdSalted.name ?? ''
    if (!secondSourceId) throw new Error('beforeAll: salted upload returned no id')
  })

  test.afterAll(async ({ request }) => {
    if (firstSourceId) await apiDelete(request, `/sources/${firstSourceId}`).catch(() => {})
    if (secondSourceId) await apiDelete(request, `/sources/${secondSourceId}`).catch(() => {})
    if (secondSaltedFixturePath && fs.existsSync(secondSaltedFixturePath)) {
      try { fs.unlinkSync(secondSaltedFixturePath) } catch { /* ignore */ }
    }
  })

  test('duplicate upload via UI opens the duplicate-source dialog', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/sources`)
    await expect(page.getByText(firstSourceName)).toBeVisible({ timeout: 10000 })

    // Open the upload modal.
    await page.getByRole('button', { name: /new source/i }).click()
    await page.getByRole('menuitem', { name: /upload files/i }).click()

    // Pick the same fixture file via the file input.
    await page.locator('input[type="file"]').setInputFiles(FIXTURE)

    // Submit the upload form. The button label in the upload dialog is "Upload".
    await page.getByRole('button', { name: /^upload$/i }).click()

    // DuplicateSourceDialog appears. Scope all dialog queries to its role
    // because the shadcn DialogContent renders its own X-icon "Close" button
    // (in addition to our footer Close button) and the source name appears
    // in the sources list table behind the dialog.
    const dialog = page.getByRole('dialog').filter({
      hasText: 'This file is already in your sources',
    })
    await expect(dialog).toBeVisible({ timeout: 10000 })

    // Footer Close button dismisses the dialog. Scope to the dialog so we
    // don't strict-mode-collide with the shadcn DialogContent's built-in
    // X-icon "Close" button.
    await dialog.getByRole('button', { name: /^close$/i }).last().click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  })

  test('"Open" opens the existing source in a new tab', async ({ page, context }) => {
    await page.goto(`/project/${PROJECT_REF}/sources`)
    await page.getByRole('button', { name: /new source/i }).click()
    await page.getByRole('menuitem', { name: /upload files/i }).click()
    await page.locator('input[type="file"]').setInputFiles(FIXTURE)
    await page.getByRole('button', { name: /^upload$/i }).click()

    const dialog = page.getByRole('dialog').filter({
      hasText: 'This file is already in your sources',
    })
    await expect(dialog).toBeVisible({ timeout: 10000 })

    // window.open() fires a 'page' event on the BrowserContext. Wait for it
    // and assert the new tab's URL points at the source detail page.
    const newPagePromise = context.waitForEvent('page')
    await dialog.getByRole('button', { name: /^open$/i }).click()
    const newPage = await newPagePromise
    await newPage.waitForLoadState('domcontentloaded')
    expect(newPage.url()).toMatch(new RegExp(`/project/${PROJECT_REF}/sources/${firstSourceId}`))
    await newPage.close()

    // The original page still has the dialog open (window.open doesn't close it).
    await expect(dialog).toBeVisible()
  })

  test('multiple duplicate uploads via UI lists all in one dialog', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/sources`)
    // Confirm the source list is loaded (both seed sources visible in the table).
    await expect(page.getByRole('cell', { name: firstSourceName })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: /new source/i }).click()
    await page.getByRole('menuitem', { name: /upload files/i }).click()

    // Select both fixtures — raw + salted — so both content hashes already
    // exist in the project and both uploads will 409.
    await page.locator('input[type="file"]').setInputFiles([FIXTURE, secondSaltedFixturePath])

    // Submit. With two files, the button label is "Upload 2 files".
    await page.getByRole('button', { name: /^upload\s+2\s+files$/i }).click()

    // Scope everything to the dialog so we don't collide with the source
    // list table behind it.
    const dialog = page.getByRole('dialog').filter({
      hasText: /are already in your sources/i,
    })
    await expect(dialog).toBeVisible({ timeout: 10000 })

    // Title is the plural form.
    await expect(dialog.getByText(/2 files are already in your sources/i)).toBeVisible()

    // Both existing source names appear in the dialog body, one per row.
    await expect(dialog.getByText(firstSourceName)).toBeVisible()
    await expect(dialog.getByText(secondSourceName)).toBeVisible()

    // The dialog should also show the names of the files the user just
    // tried to upload, so they can tell which source-file maps to which
    // existing-source collision.
    const uploadedSecondName = path.basename(secondSaltedFixturePath)
    await expect(dialog.getByText(uploadedSecondName)).toBeVisible()

    // Footer Close dismisses (scoped to dialog to avoid shadcn's built-in
    // X-icon "Close" button).
    await dialog.getByRole('button', { name: /^close$/i }).last().click()
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  })
})
