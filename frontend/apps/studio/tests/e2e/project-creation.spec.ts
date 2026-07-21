/**
 * project-creation.spec.ts
 *
 * E2E tests for the create-project wizard (/new/{slug}).
 *
 * Covers:
 *   1. Submit button is disabled until at least one AI provider key is filled,
 *      and becomes enabled once a key is entered.
 *   2. A 400 response from the backend with a JSON-encoded `fields` error object
 *      in `message` renders an inline field error next to the relevant input.
 *
 * Both tests mock backend calls so no actual provisioning occurs.
 *
 * Env:
 *   E2E_ORG_SLUG  — org slug for /new/{slug} (default: 'test')
 */

import { test, expect } from '@playwright/test'

const ORG_SLUG = process.env.E2E_ORG_SLUG || 'test'

test.describe('Create project — LLM provider key gate', () => {
  // ─── 1. SUBMIT DISABLED WITHOUT KEY ───────────────────────────────────────

  test('submit is disabled until at least one AI provider key is filled', async ({ page }) => {
    await page.goto(`/new/${ORG_SLUG}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Fill project name (≥3 chars required by the form)
    await page.getByLabel(/project name/i).fill('E2E Test Project')

    const submit = page.getByRole('button', { name: /create new project/i })

    // Without any AI provider key, submit must be disabled
    await expect(submit).toBeDisabled()

    // Fill one key — OpenAI
    await page.getByLabel(/openai api key/i).fill('sk-e2e-test-key')

    // Now submit should be enabled
    await expect(submit).toBeEnabled()
  })

  // ─── 2. BACKEND 400 RENDERS INLINE FIELD ERROR ────────────────────────────

  test('backend 400 with field error renders inline error next to OpenAI input', async ({
    page,
  }) => {
    // The error flow:
    //   POST /platform/projects → 400 with { message: "<JSON>" }
    //   fetchers.ts handleFetchError: resJson.message → ResponseError.message
    //   project-create-mutation.ts onError: JSON.parse(err.message) → { fields: { openai: "..." } }
    //   [slug].tsx: setKeyFieldErrors(parsed.fields)
    //   AIProviderKeysInput: renders <p>{fieldErrors.openai}</p>
    await page.route('**/platform/projects', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      const fieldErrorPayload = JSON.stringify({
        error: 'Invalid API keys',
        fields: { openai: 'Provider returned 401' },
      })
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: fieldErrorPayload }),
      })
    })

    await page.goto(`/new/${ORG_SLUG}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Fill the form to satisfy all validation gates
    await page.getByLabel(/project name/i).fill('E2E Test Project')
    await page.getByLabel(/openai api key/i).fill('sk-e2e-test-key')

    await page.getByRole('button', { name: /create new project/i }).click()
    await page.waitForTimeout(1500)

    // The field-level error should appear inline beneath the OpenAI input
    await expect(page.getByText(/provider returned 401/i)).toBeVisible({ timeout: 5000 })
  })
})
