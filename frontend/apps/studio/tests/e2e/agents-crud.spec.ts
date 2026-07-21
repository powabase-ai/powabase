/**
 * agents-crud.spec.ts
 *
 * Write-path smoke test for all 6 agents sub-tabs.
 * Covers: list, settings, tools, kb, mcp, hooks.
 *
 * Architecture:
 * - One test.describe.serial() block — tests share a single disposable agent.
 * - beforeAll creates the agent via direct REST API.
 * - afterAll deletes it.
 * - Each sub-tab test: navigate → UI write → assert UI state + re-fetch via API.
 *
 * Auth: token is read from the Playwright storageState file.
 * The dashboard stores the session under "supabase.dashboard.auth.token"
 * (NOT the sb-<ref>-auth-token key used by project-side Supabase clients).
 */

import { test, expect } from '@playwright/test'
import { apiPost, apiGet, apiDelete } from './support/api-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

// ---------------------------------------------------------------------------

test.describe.serial('agents CRUD — single-user write paths', () => {
  let agentId: string
  const agentName = `crud-smoke-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    const created = await apiPost<{ id: string }>(request, '/agents', {
      name: agentName,
      system_prompt: 'Test agent for CRUD smoke',
    })
    agentId = created.id
    if (!agentId) throw new Error('beforeAll: agent creation returned no id')
  })

  test.afterAll(async ({ request }) => {
    if (agentId) await apiDelete(request, `/agents/${agentId}`)
  })

  // ─── 1. LIST ────────────────────────────────────────────────────────────

  test('list: test agent appears on agents list', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/agents`)
    await expect(page.getByText(agentName)).toBeVisible({ timeout: 10000 })
    // 2 assertions: card text present and page loads without error
    await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible()
  })

  // ─── 2. SETTINGS ────────────────────────────────────────────────────────
  test('settings: save settings writes max_steps to DB', async ({ page, request }) => {
    await page.goto(`/project/${PROJECT_REF}/agents/${agentId}`)
    await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    await page.getByRole('tab', { name: 'Settings' }).click()
    await expect(page.getByRole('button', { name: /save settings/i })).toBeVisible({ timeout: 5000 })

    const maxStepsInput = page.locator('input[type="number"]').first()
    await maxStepsInput.fill('42')
    await page.getByRole('button', { name: /save settings/i }).click()

    // This assertion fails (Saved text never appears) — documenting the broken write path.
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 })
    const agent = await apiGet<{ id: string; settings: Record<string, unknown> }>(request, `/agents/${agentId}`)
    expect(agent.settings?.max_steps).toBe(42)
  })

  // ─── 3. TOOLS ───────────────────────────────────────────────────────────
  // Assign builtin tool "database_query" via checkbox, then unassign.

  test('tools: assign and unassign a builtin tool', async ({ page, request }) => {
    await page.goto(`/project/${PROJECT_REF}/agents/${agentId}`)
    await page.getByRole('tab', { name: 'Tools' }).click()

    // Wait for builtin tools section to load
    await expect(page.getByText('Built-in Tools')).toBeVisible({ timeout: 10000 })

    // Find the database_query checkbox (label contains the tool name)
    const databaseQueryLabel = page.locator('label').filter({ hasText: 'database_query' })
    const databaseQueryCheckbox = databaseQueryLabel.locator('input[type="checkbox"]')

    // Ensure not checked initially (clean agent), then assign
    const wasChecked = await databaseQueryCheckbox.isChecked()
    if (wasChecked) {
      // already assigned from a previous test run — unassign first
      await databaseQueryCheckbox.click()
      await page.waitForLoadState('networkidle')
    }

    await databaseQueryCheckbox.click()
    await page.waitForLoadState('networkidle')

    // UI: checkbox is now checked
    await expect(databaseQueryCheckbox).toBeChecked({ timeout: 5000 })

    // API: assignment exists
    const { tools } = await apiGet<{ tools: Array<{ tool_type: string; tool_name: string; id: string }> }>(
      request,
      `/agents/${agentId}/tools`
    )
    const assignment = tools.find((t) => t.tool_type === 'builtin' && t.tool_name === 'database_query')
    expect(assignment, 'database_query tool assignment should exist in API').toBeTruthy()

    // Now unassign — click checkbox again to deselect
    await databaseQueryCheckbox.click()
    await page.waitForLoadState('networkidle')

    // UI: unchecked
    await expect(databaseQueryCheckbox).not.toBeChecked({ timeout: 5000 })

    // API: assignment removed
    const { tools: toolsAfter } = await apiGet<{ tools: Array<{ tool_type: string; tool_name: string }> }>(
      request,
      `/agents/${agentId}/tools`
    )
    const stillThere = toolsAfter.find((t) => t.tool_type === 'builtin' && t.tool_name === 'database_query')
    expect(stillThere, 'database_query should be removed from API after unassign').toBeFalsy()
  })

  // ─── 4. KNOWLEDGE BASES ─────────────────────────────────────────────────
  // The project already has KBs. Assign via UI then remove.

  test('kb: assign and remove a knowledge base', async ({ page, request }) => {
    await page.goto(`/project/${PROJECT_REF}/agents/${agentId}`)
    await page.getByRole('tab', { name: 'Knowledge Bases' }).click()

    // Wait for KB tab to load (the heading is always visible)
    await expect(page.getByRole('heading', { name: /Dynamic Search/i })).toBeVisible({ timeout: 10000 })

    // Click "+ Assign Knowledge Base"
    await page.getByRole('button', { name: /assign knowledge base/i }).click()

    // Wait for picker to appear
    await expect(page.getByText('Select a Knowledge Base')).toBeVisible({ timeout: 5000 })

    // Click the first KB in the picker
    const kbButton = page.locator('button').filter({ hasText: /E2E KB/ }).first()
    const kbName = (await kbButton.textContent()) ?? ''
    await kbButton.click()
    await page.waitForLoadState('networkidle')

    // UI: assigned KB name appears in the list
    await expect(page.getByText(kbName.trim(), { exact: false })).toBeVisible({ timeout: 5000 })

    // API: assignment exists
    const { knowledge_bases } = await apiGet<{ knowledge_bases: Array<{ id: string; knowledge_base_id: string }> }>(
      request,
      `/agents/${agentId}/knowledge-bases`
    )
    expect(knowledge_bases.length, 'should have at least 1 KB assignment').toBeGreaterThan(0)

    // Remove the first assignment via the "Remove" button
    await page.getByRole('button', { name: 'Remove' }).first().click()

    // Wait for UI to reflect the removal (the component re-fetches after remove)
    await expect(page.getByText('No knowledge bases assigned.')).toBeVisible({ timeout: 5000 })

    // API: KB gone
    const kbAfterRemove = await apiGet<{ knowledge_bases: Array<unknown> }>(
      request,
      `/agents/${agentId}/knowledge-bases`
    )
    expect(kbAfterRemove.knowledge_bases.length, 'KB assignment should be removed').toBe(0)
  })

  // ─── 5. MCP SERVERS ─────────────────────────────────────────────────────
  // Add a server, toggle enabled/disabled, remove.
  // Note: "Discover Tools" is NOT tested — F5 deferred (BE endpoint missing).

  test('mcp: add, toggle enabled, and remove a server', async ({ page, request }) => {
    await page.goto(`/project/${PROJECT_REF}/agents/${agentId}`)
    await page.getByRole('tab', { name: 'MCP Servers' }).click()

    // Wait for MCP tab to render
    await expect(page.getByRole('button', { name: /add server/i })).toBeVisible({ timeout: 10000 })

    // Open "Add Server" panel
    await page.getByRole('button', { name: /add server/i }).click()
    await expect(page.getByText('Add MCP Server')).toBeVisible({ timeout: 5000 })

    // Fill in form — labels are not explicitly linked to inputs (no htmlFor/id),
    // so we locate inputs by their position within the "Add MCP Server" section.
    // The form has: Name, URL, Transport (select), Headers — in that order.
    const addServerSection = page.locator('div').filter({ hasText: 'Add MCP Server' }).last()
    const textInputs = addServerSection.locator('input[type="text"]')
    // First text input = Name, second = URL
    await textInputs.nth(0).fill('smoke-mcp')
    await textInputs.nth(1).fill('http://localhost:9999')

    // Click "Add Server" submit button
    await page.getByRole('button', { name: /^Add Server$/ }).click()
    await page.waitForLoadState('networkidle')

    // UI: server name appears
    await expect(page.getByText('smoke-mcp')).toBeVisible({ timeout: 5000 })

    // API: server exists and is enabled by default
    const { mcp_servers: serversAfterAdd } = await apiGet<{ mcp_servers: Array<{ id: string; name: string; enabled: boolean }> }>(
      request,
      `/agents/${agentId}/mcp-servers`
    )
    const server = serversAfterAdd.find((s) => s.name === 'smoke-mcp')
    expect(server, 'smoke-mcp server should exist in API').toBeTruthy()
    expect(server!.enabled, 'server should be enabled by default').toBe(true)
    const serverId = server!.id

    // Toggle: click "Disable"
    await page.getByRole('button', { name: 'Disable' }).click()

    // Wait for UI to reflect the toggle: button changes to "Enable"
    await expect(page.getByRole('button', { name: 'Enable' })).toBeVisible({ timeout: 5000 })

    // API: server is now disabled
    const { mcp_servers: serversAfterDisable } = await apiGet<{ mcp_servers: Array<{ id: string; name: string; enabled: boolean }> }>(
      request,
      `/agents/${agentId}/mcp-servers`
    )
    const serverAfterDisable = serversAfterDisable.find((s) => s.id === serverId)
    expect(serverAfterDisable!.enabled, 'server should be disabled after toggle').toBe(false)

    // Remove: page.on('dialog') must be registered BEFORE the click that triggers it
    const removeDialogHandler = (dialog: import('@playwright/test').Dialog) => dialog.accept()
    page.on('dialog', removeDialogHandler)
    await page.getByRole('button', { name: 'Remove' }).click()

    // Wait for UI: server name disappears
    await expect(page.getByText('smoke-mcp')).not.toBeVisible({ timeout: 5000 })

    // API: server gone
    const { mcp_servers: serversAfterRemove } = await apiGet<{ mcp_servers: Array<{ id: string }> }>(
      request,
      `/agents/${agentId}/mcp-servers`
    )
    const stillThere = serversAfterRemove.find((s) => s.id === serverId)
    expect(stillThere, 'server should be removed from API').toBeFalsy()
  })

  // ─── 6. HOOKS ───────────────────────────────────────────────────────────
  test('hooks: add and remove an approval hook', async ({ page, request }) => {
    await page.goto(`/project/${PROJECT_REF}/agents/${agentId}`)
    await page.getByRole('tab', { name: 'Hooks' }).click()

    // Wait for hooks tab to render
    await expect(page.getByRole('button', { name: /add hook/i })).toBeVisible({ timeout: 10000 })

    // Open add hook form
    await page.getByRole('button', { name: /add hook/i }).click()
    await expect(page.getByRole('heading', { name: 'Add Hook', exact: true })).toBeVisible({ timeout: 5000 })

    // Event defaults to PreToolUse; type defaults to approval — that's fine.
    // Fill the approval message input (identified by its placeholder text).
    const approvalMsgInput = page.locator('input[placeholder="Agent wants to modify the database"]')
    await approvalMsgInput.fill('Smoke test approval prompt')

    // Submit
    await page.getByRole('button', { name: /^Add Hook$/ }).click()
    await page.waitForLoadState('networkidle')

    // UI: hook appears in the grouped list — the event heading "PreToolUse" appears
    // as an h4 element (not a select option). getByRole scopes to visible headings.
    await expect(page.getByRole('heading', { name: 'PreToolUse', exact: true })).toBeVisible({ timeout: 5000 })

    // API: hook exists
    const { hooks } = await apiGet<{ hooks: Array<{ id: string; event: string; type: string; config: Record<string, unknown> }> }>(
      request,
      `/agents/${agentId}/hooks`
    )
    const hook = hooks.find((h) => h.event === 'PreToolUse' && h.type === 'approval')
    expect(hook, 'PreToolUse/approval hook should exist in API').toBeTruthy()
    expect(hook!.config.message, 'hook config message should be persisted').toBe('Smoke test approval prompt')
    const hookId = hook!.id

    // Remove: register dialog handler BEFORE the click that triggers it
    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Remove' }).click()

    // Wait for UI: the grouped event heading disappears when no hooks remain
    await expect(page.getByRole('heading', { name: 'PreToolUse', exact: true })).not.toBeVisible({ timeout: 5000 })

    // API: hook gone
    const { hooks: hooksAfter } = await apiGet<{ hooks: Array<{ id: string }> }>(
      request,
      `/agents/${agentId}/hooks`
    )
    const stillThere = hooksAfter.find((h) => h.id === hookId)
    expect(stillThere, 'hook should be removed from API').toBeFalsy()
  })
})
