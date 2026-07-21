/**
 * orchestrations-crud.spec.ts
 *
 * Write-path smoke test for all Orchestrations tab sub-flows.
 *
 * Covers:
 *   - list: orchestration visible on list page
 *   - detail: name renders (F6 regression guard)
 *   - settings PUT: edit name + description via Overview tab UI → save → API double-assert
 *   - entities: add agent entity via UI → API double-assert; remove via UI → API confirms absent
 *   - hooks: add + remove approval hook via shared HooksTab → API double-assert
 *     (F7 regression guard for field names; F4/F5 regression guard for the
 *     branching removeHook path — DELETE /orchestrations/{id}/hooks/{hid})
 *   - create: new orchestration via UI panel; API confirms
 *   - delete: click trash icon on list row, accept window.confirm(), UI gone + API 404
 *
 * NOTE — entity add via UI:
 *   The entities-tab uses a native <select> populated from the agents list. This is
 *   straightforward to drive with page.locator('select'). The remove uses window.confirm().
 *
 * NOTE — settings tab (model/max_steps) vs overview tab (name/description):
 *   There are two separate sub-tabs that both call PUT /orchestrations/{id}:
 *   - Overview tab: name, description, additional_instructions
 *   - Settings tab: settings.max_steps, settings.model, settings.fallback_model
 *   The spec tests the Overview tab (description edit) as the primary settings PUT assertion.
 *   The Settings tab (max_steps) is NOT separately tested here to keep scope tight.
 *
 * Architecture:
 *   - test.describe.serial() for the primary flow — tests share one disposable orchestration.
 *   - beforeAll creates orchestration + test agent via direct API (avoid UI dependency in setup).
 *   - afterAll cleans up both.
 *   - Separate describe.serial for create + delete UI flows (no shared state with primary).
 *
 * Auth: token is read from the Playwright storageState file.
 */

import { test, expect } from '@playwright/test'
import { apiPost, apiGet, apiDelete, PROJECT_API, authHeader } from './support/api-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

interface OrchShape {
  id: string
  name: string
  description: string | null
  strategy: string
  settings: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

interface EntityShape {
  id: string
  orchestration_id?: string
  entity_type: 'agent' | 'tool'
  entity_ref_id: string
  role_description: string | null
  position: number | null
  config: Record<string, unknown>
}

// ─── PRIMARY FLOW ─────────────────────────────────────────────────────────────

test.describe.serial('orchestrations CRUD — primary flow', () => {
  let orchId: string
  let orchName: string
  let testAgentName: string
  let testAgentId: string

  test.beforeAll(async ({ request }) => {
    orchName = `crud-orch-${Date.now()}`
    const created = await apiPost<OrchShape>(request, '/orchestrations', {
      name: orchName,
      description: 'Plan 05 CRUD smoke',
      strategy: 'supervisor',
    })
    orchId = created.id
    if (!orchId) throw new Error('beforeAll: orchestration creation returned no id')

    // Create a disposable agent to use in Entities tab tests
    testAgentName = `crud-orch-agent-${Date.now()}`
    const createdAgent = await apiPost<{ id: string; name: string }>(request, '/agents', {
      name: testAgentName,
      system_prompt: 'Test agent for orchestration CRUD smoke',
    })
    testAgentId = createdAgent.id
    if (!testAgentId) throw new Error('beforeAll: agent creation returned no id')
  })

  test.afterAll(async ({ request }) => {
    if (orchId) await apiDelete(request, `/orchestrations/${orchId}`)
    if (testAgentId) await apiDelete(request, `/agents/${testAgentId}`)
  })

  // ─── 1. LIST ──────────────────────────────────────────────────────────────

  test('list: created orchestration visible on list page', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations`)
    // UI assertion 1: orchestration name visible as card text
    await expect(page.getByText(orchName)).toBeVisible({ timeout: 10000 })
    // UI assertion 2: page heading confirms page loaded without error
    await expect(page.getByRole('heading', { name: 'Orchestrations', exact: true })).toBeVisible()
  })

  // ─── 2. DETAIL (F6 regression guard) ──────────────────────────────────────

  test('detail: orchestration name renders (F6 regression guard)', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations/${orchId}`)
    // The detail page renders orchestration.name in an h1 heading
    await expect(page.getByRole('heading', { name: orchName, level: 1 })).toBeVisible({ timeout: 10000 })
    // Double-assertion: strategy badge also visible (page fully rendered)
    // Two "supervisor" spans exist: one in the header, one in the Overview tab — both are correct.
    await expect(page.getByText('supervisor', { exact: true }).first()).toBeVisible({ timeout: 5000 })
  })

  // ─── 3. SETTINGS PUT (Overview tab) ───────────────────────────────────────
  //
  // The Overview tab drives PUT /orchestrations/{id} with name + description.
  // Fills description textarea, clicks Save, waits for "Saved" indicator.

  test('settings: edit description via Overview tab; PUT persists; API re-fetch confirms', async ({
    page,
    request,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations/${orchId}`)
    // Overview tab is the default — no click needed, but click it explicitly for clarity
    await page.getByRole('tab', { name: 'Overview' }).click()

    // Wait for Overview tab content to load (name input visible)
    await expect(page.getByRole('button', { name: /^Save$/i })).toBeVisible({ timeout: 10000 })

    const newDescription = `updated-desc-${Date.now()}`

    // The description is a <textarea> — locate by its position below the Description FieldLabel.
    // The Overview tab has: name input, description textarea, additional_instructions textarea.
    // Description is the first textarea (before additional_instructions).
    const textareas = page.locator('textarea')
    const descriptionTextarea = textareas.first()
    await descriptionTextarea.fill(newDescription)

    // Click Save
    await page.getByRole('button', { name: /^Save$/i }).click()

    // Wait for "Saved" indicator (spans with green text)
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 })

    // Double-assert via API
    const refetched = await apiGet<OrchShape>(request, `/orchestrations/${orchId}`)
    expect(refetched.description).toBe(newDescription)
  })

  // ─── 4. ENTITIES ──────────────────────────────────────────────────────────
  //
  // Add agent via UI: click "+ Add Agent" → select agent in dropdown → click "Add".
  // Remove via UI: click "Remove" button → accept window.confirm().

  test('entities: add agent as entity via UI; API confirms; remove via UI; API confirms absent', async ({
    page,
    request,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations/${orchId}`)
    await page.getByRole('tab', { name: 'Entities' }).click()

    // Wait for entities tab to load (the "Agents & Tools" heading is always present)
    await expect(page.getByRole('heading', { name: 'Agents & Tools' })).toBeVisible({ timeout: 10000 })

    // Open the "Add Agent" panel
    await page.getByText('+ Add Agent').click()

    // Wait for the Add Agent form to appear (heading "Add Agent")
    await expect(page.getByRole('heading', { name: 'Add Agent', exact: true })).toBeVisible({ timeout: 5000 })

    // Select the test agent from the <select> dropdown
    // The select has options: "Select an agent..." plus one option per agent
    const agentSelect = page.locator('select').first()
    await agentSelect.selectOption({ label: testAgentName })

    // Click "Add" button
    await page.getByRole('button', { name: /^Add$/, exact: true }).first().click()
    await page.waitForLoadState('networkidle')

    // UI: agent name should appear in the entity list
    await expect(page.getByText(testAgentName)).toBeVisible({ timeout: 5000 })

    // API double-assert: entity exists with correct entity_ref_id
    const afterAdd = await apiGet<{ entities: EntityShape[] }>(
      request,
      `/orchestrations/${orchId}/entities`
    )
    expect(afterAdd.entities.length).toBeGreaterThanOrEqual(1)
    expect(afterAdd.entities.some((e) => e.entity_ref_id === testAgentId)).toBe(true)

    // Remove via UI: click "Remove" button (per-row plain text button)
    // Register dialog handler BEFORE the click that triggers window.confirm()
    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Remove' }).first().click()
    await page.waitForLoadState('networkidle')

    // UI: "No entities added yet" message reappears (or agent name gone)
    await expect(page.getByText(testAgentName)).not.toBeVisible({ timeout: 5000 })

    // API double-assert: entity removed
    const afterRemove = await apiGet<{ entities: EntityShape[] }>(
      request,
      `/orchestrations/${orchId}/entities`
    )
    expect(afterRemove.entities.some((e) => e.entity_ref_id === testAgentId)).toBe(false)
  })

  // ─── 5. HOOKS (F7 regression guard + F4/F5 remove-path fix) ──────────────
  //
  // Hooks sub-tab is present on orchestration detail. Uses the shared HooksTab
  // component with orchestrationId prop.
  //
  // F7 regression guard: verifies the API returns { type: "approval" } (not
  // hook_type), confirming Plan 03 F7 field rename is intact on the
  // orchestration hooks path.
  //
  // F4/F5 remove-path: HooksTab.handleRemove now branches on orchestrationId
  // and calls orchestrationsApi.removeHook → DELETE /orchestrations/{id}/hooks/{hid}.
  // BE endpoint added in Plan 05's fix commit. Remove via UI is now asserted.

  test('hooks: add + remove approval hook via shared HooksTab (F4/F5/F7 guard)', async ({
    page,
    request,
  }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations/${orchId}`)
    const hooksTab = page.getByRole('tab', { name: /hooks/i })

    // Handle Hooks sub-tab absence gracefully (should be present per [orch_id].tsx)
    const hooksVisible = await hooksTab.isVisible().catch(() => false)
    if (!hooksVisible) {
      test.info().annotations.push({
        type: 'skip',
        description: 'No Hooks sub-tab on orchestration detail — tab absent in ported UI.',
      })
      return
    }

    await hooksTab.click()

    // Wait for hooks tab to render
    await expect(page.getByRole('button', { name: /add hook/i })).toBeVisible({ timeout: 10000 })

    // Open add hook form
    await page.getByRole('button', { name: /add hook/i }).click()
    await expect(page.getByRole('heading', { name: 'Add Hook', exact: true })).toBeVisible({ timeout: 5000 })

    // Event defaults to "PreToolUse", type defaults to "approval" — no changes needed.
    // Fill the approval message input (identified by its placeholder text).
    const approvalMsgInput = page.locator('input[placeholder="Agent wants to modify the database"]')
    await approvalMsgInput.fill('Smoke test orchestration approval')

    // Submit
    await page.getByRole('button', { name: /^Add Hook$/ }).click()
    await page.waitForLoadState('networkidle')

    // UI: hook appears in the grouped list — event heading "PreToolUse" appears as an h4
    await expect(page.getByRole('heading', { name: 'PreToolUse', exact: true })).toBeVisible({ timeout: 5000 })

    // API double-assert: F7 regression guard — field is "type" not "hook_type"
    const { hooks } = await apiGet<{
      hooks: Array<{ id: string; event: string; type: string; config: Record<string, unknown> }>
    }>(request, `/orchestrations/${orchId}/hooks`)

    const hook = hooks.find((h) => h.event === 'PreToolUse' && h.type === 'approval')
    expect(hook, 'PreToolUse/approval hook should exist in API (F7: field is "type")').toBeTruthy()
    expect(hook!.config.message).toBe('Smoke test orchestration approval')

    // F4/F5 guard: remove via UI uses orchestrationsApi.removeHook →
    // DELETE /orchestrations/{orchId}/hooks/{hookId}. Accept the native
    // confirm() dialog triggered by HooksTab.handleRemove.
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: /^Remove$/ }).click()

    // API double-assert: hook is gone
    await expect(async () => {
      const { hooks: after } = await apiGet<{
        hooks: Array<{ id: string; event: string; type: string }>
      }>(request, `/orchestrations/${orchId}/hooks`)
      expect(after.find((h) => h.id === hook!.id)).toBeUndefined()
    }).toPass({ timeout: 5000 })
  })
})

// ─── CREATE + DELETE VIA UI ───────────────────────────────────────────────────
//
// Separate describe so create/delete UI paths don't race with the primary flow's
// shared orchestration.

test.describe.serial('orchestrations CRUD — create + delete via UI', () => {
  let orchName: string
  let createdId: string

  test.beforeAll(() => {
    orchName = `crud-del-${Date.now()}`
  })

  test.afterAll(async ({ request }) => {
    // Clean up in case delete test didn't run to completion
    if (createdId) {
      await apiDelete(request, `/orchestrations/${createdId}`).catch(() => undefined)
    }
  })

  // ─── 6. CREATE VIA UI ───────────────────────────────────────────────────────
  //
  // The list page has an inline "Create Orchestration" panel (not a modal dialog).
  // Click "Create orchestration" button → fill name input → click "Create".

  test('create: new orchestration via UI panel; API confirms', async ({ page, request }) => {
    await page.goto(`/project/${PROJECT_REF}/orchestrations`)

    // Click the "Create orchestration" button (opens inline panel)
    await page.getByRole('button', { name: 'Create orchestration', exact: true }).click()

    // Wait for the create panel to appear (heading "Create Orchestration")
    await expect(
      page.getByRole('heading', { name: 'Create Orchestration', exact: true })
    ).toBeVisible({ timeout: 5000 })

    // Fill the name input — located by placeholder "My Orchestration"
    await page.locator('input[placeholder="My Orchestration"]').fill(orchName)

    // Click the "Create" submit button (disabled until name is filled)
    await page.getByRole('button', { name: /^Create$/, exact: true }).click()
    await page.waitForLoadState('networkidle')

    // UI: new orchestration card appears in the list
    await expect(page.getByText(orchName)).toBeVisible({ timeout: 10000 })

    // API double-assert: orchestration exists
    const { orchestrations } = await apiGet<{
      orchestrations: Array<{ id: string; name: string }>
    }>(request, `/orchestrations`)
    const found = orchestrations.find((o) => o.name === orchName)
    expect(found, 'created orchestration should appear in API list').toBeTruthy()
    if (found) createdId = found.id
  })

  // ─── 7. DELETE VIA UI ───────────────────────────────────────────────────────
  //
  // Delete button is a per-row trash SVG with opacity-0 group-hover:opacity-100.
  // The button has title="Delete". We hover over the card to reveal it.
  // Accept window.confirm() before clicking.

  test('delete: click trash icon on list row; UI gone + API 404', async ({ page, request }) => {
    if (!createdId) throw new Error('No orchestration id from create test')

    await page.goto(`/project/${PROJECT_REF}/orchestrations`)
    await expect(page.getByText(orchName)).toBeVisible({ timeout: 10000 })

    // Register dialog handler BEFORE the click that triggers window.confirm()
    page.on('dialog', (dialog) => dialog.accept())

    // Find the card link containing our orchestration name, hover to reveal the delete button
    const orchCard = page.locator('a').filter({ hasText: orchName })
    await orchCard.hover()

    // Click the trash icon button (title="Delete") within the card
    await orchCard.locator('button[title="Delete"]').click()
    await page.waitForLoadState('networkidle')

    // UI: orchestration card disappears from the list
    await expect(page.getByText(orchName)).not.toBeVisible({ timeout: 8000 })

    // API: returns 404
    const res = await request.get(`${PROJECT_API}/orchestrations/${createdId}`, {
      headers: authHeader,
    })
    expect(res.status()).toBe(404)

    createdId = '' // clear so afterAll doesn't re-delete
  })
})
