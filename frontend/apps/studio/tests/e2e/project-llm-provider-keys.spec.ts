/**
 * project-llm-provider-keys.spec.ts
 *
 * E2E smoke tests for /project/{ref}/settings/llm-keys.
 *
 * Covers:
 *   1. Page loads with the "LLM Provider Keys" heading and no runtime errors.
 *   2. Add-key dialog offers exactly 4 providers (OpenAI, Anthropic, Google,
 *      OpenRouter) and NOT Mistral or E2B.
 *   3. Add → Delete flow with a fake OpenRouter key — POST and GET are mocked
 *      via page.route so no real provider call is made.
 *
 * Env:
 *   E2E_PROJECT_REF  — project ref (required)
 */

import { test, expect } from '@playwright/test'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

// URL pattern for the project-api proxy (control plane routes through here)
const KEYS_API_PATTERN = `**/platform/project-api/${PROJECT_REF}/ai-provider-keys`

const FAKE_KEY_VALUE = 'sk-or-e2e-fake-12345'

const FAKE_KEY_ROW = {
  provider: 'openrouter',
  masked_key: 'sk-or...2345',
  is_valid: null,
  last_validated_at: null,
}

test.describe('Project LLM Provider Keys settings', () => {
  // ─── 1. PAGE LOADS ────────────────────────────────────────────────────────

  test('page loads with LLM Provider Keys heading and no runtime errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`/project/${PROJECT_REF}/settings/llm-keys`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    expect(errors, `Runtime errors on page load:\n  ${errors.join('\n  ')}`).toHaveLength(0)

    await expect(page.getByRole('heading', { name: 'LLM Provider Keys' })).toBeVisible()
  })

  // ─── 2. DIALOG PROVIDERS ─────────────────────────────────────────────────

  test('Add Key dialog shows exactly OpenAI, Anthropic, Google, OpenRouter — not Mistral or E2B', async ({
    page,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/settings/llm-keys`)
    await page.waitForLoadState('domcontentloaded')

    // Open the Add Key dialog
    await page.getByRole('button', { name: /add key/i }).click()

    // Open the provider select to reveal options
    await page.getByRole('combobox').click()
    await page.waitForTimeout(300)

    // Providers that MUST be present
    for (const label of ['OpenAI', 'Anthropic', 'Google', 'OpenRouter']) {
      await expect(page.getByText(new RegExp(`^${label}`))).toBeVisible()
    }

    // Providers that MUST NOT be present
    for (const label of ['Mistral', 'E2B']) {
      await expect(page.getByText(new RegExp(`^${label}`))).toHaveCount(0)
    }
  })

  // ─── 3. ADD → DELETE FLOW (mocked) ───────────────────────────────────────

  test('can add and delete an OpenRouter key (mocked POST + GET)', async ({ page }) => {
    // Track how many keys the "list" GET returns so we can toggle before/after
    let serveNewKey = false

    // Mock GET /ai-provider-keys — returns the fake row only after POST
    await page.route(KEYS_API_PATTERN, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(serveNewKey ? [FAKE_KEY_ROW] : []),
        })
        return
      }

      if (route.request().method() === 'POST') {
        serveNewKey = true
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(FAKE_KEY_ROW),
        })
        return
      }

      // Pass through anything else (DELETE, etc.)
      await route.continue()
    })

    // Mock DELETE /ai-provider-keys/openrouter
    await page.route(`${KEYS_API_PATTERN}/openrouter`, async (route) => {
      if (route.request().method() === 'DELETE') {
        serveNewKey = false
        await route.fulfill({ status: 204 })
        return
      }
      await route.continue()
    })

    await page.goto(`/project/${PROJECT_REF}/settings/llm-keys`)
    await page.waitForLoadState('domcontentloaded')

    // --- ADD ---
    await page.getByRole('button', { name: /add key/i }).click()

    // Select OpenRouter from the combobox
    await page.getByRole('combobox').click()
    await page.waitForTimeout(300)
    await page.getByRole('option', { name: /openrouter/i }).click()

    // Fill the API key input (a masked text field — NOT type=password, to
    // stop password managers autofilling a saved credential over it)
    await page.locator('#llm-api-key').fill(FAKE_KEY_VALUE)

    // Click Save
    await page.getByRole('button', { name: /^save$/i }).click()
    await page.waitForTimeout(1500)

    // The dialog should close and the key row should appear (masked_key visible)
    await expect(page.getByText(FAKE_KEY_ROW.masked_key)).toBeVisible({ timeout: 5000 })

    // --- DELETE ---
    const keyRow = page.locator('div').filter({ hasText: /OpenRouter/ }).filter({ hasText: FAKE_KEY_ROW.masked_key }).first()
    await keyRow.getByRole('button', { name: /delete/i }).click()
    await page.waitForTimeout(1500)

    // Row should disappear
    await expect(page.getByText(FAKE_KEY_ROW.masked_key)).not.toBeVisible({ timeout: 5000 })
  })
})
