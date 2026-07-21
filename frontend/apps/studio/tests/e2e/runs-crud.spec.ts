/**
 * runs-crud.spec.ts
 *
 * Write-path smoke test for the Runs tab (Plan 02 retro).
 *
 * Background (Plan 02 retro):
 * Plan 02 closed the runs tab as "ship-ready" using only GET curl + read-only
 * browser smoke.  Two write paths were never exercised:
 *   1. sessionsApi.delete  — covered by this test
 *   2. runsApi.approve     — DEFERRED.  Requires an agent with an approval hook
 *      (PreToolUse/approval type) AND a run that is currently in the
 *      "awaiting_approval" state.  Generating that state reliably needs a
 *      real pending ReAct loop with an in-memory run registry entry, which is
 *      too much infrastructure for a retro.  Tracked as a followup: once
 *      Plan 02 fully re-opens and approval-hook infra is stable, add a test
 *      that calls runsApi.approve() from runs-api.ts.
 *
 * This test:
 *   - Creates a disposable agent + run via REST API in beforeAll
 *     (the run response contains session_id we need)
 *   - Navigates to /runs, finds the session, clicks the delete button,
 *     confirms the native browser confirm(), and asserts:
 *       a) The session row disappears from the sidebar (UI assertion)
 *       b) GET /sessions/{session_id} returns 404 (API assertion)
 *   - afterAll deletes the agent (sessions cascade automatically)
 *
 * Auth: token read from Playwright storageState (same pattern as agents-crud.spec.ts).
 */

import { test, expect } from '@playwright/test'
import { apiPost, apiGetRaw, apiDelete } from './support/api-helpers'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

// ---------------------------------------------------------------------------

test.describe.serial('runs CRUD — session delete write path (Plan 02 retro)', () => {
  let agentId: string
  let sessionId: string
  const agentName = `runs-retro-smoke-${Date.now()}`

  test.beforeAll(async ({ request }) => {
    // 1. Create a disposable agent
    const agent = await apiPost<{ id: string }>(request, '/agents', {
      name: agentName,
      system_prompt: 'Retro test agent for runs CRUD smoke',
    })
    agentId = agent.id
    if (!agentId) throw new Error('beforeAll: agent creation returned no id')

    // 2. POST a run against the agent (non-streaming); the response contains session_id
    const run = await apiPost<{ session_id: string; run_id: string; status: string }>(
      request,
      `/agents/${agentId}/run`,
      { message: 'Retro test run' }
    )
    sessionId = run.session_id
    if (!sessionId) throw new Error(`beforeAll: run response missing session_id. Full response keys: ${Object.keys(run).join(', ')}`)
  })

  test.afterAll(async ({ request }) => {
    // Agent delete cascades sessions; clean up regardless of test outcome
    if (agentId) await apiDelete(request, `/agents/${agentId}`)
  })

  // ─── Session delete ─────────────────────────────────────────────────────

  test('session delete: remove session via UI, confirm removal via API', async ({ page }) => {
    await page.goto(`/project/${PROJECT_REF}/runs`)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)

    // Find the session row: each row has title={session_id} as a data attribute
    // and the first_message text from the run.
    // The delete button is hidden by default (opacity-0 group-hover) but becomes
    // visible on hover.  It carries title="Delete session".
    // Approach: hover the session row so the button becomes visible, then click it.
    const sessionRow = page.locator(`[title="${sessionId}"]`)
    await expect(sessionRow).toBeVisible({ timeout: 10000 })

    // Register native-confirm handler BEFORE hovering/clicking (confirm fires synchronously)
    page.on('dialog', (dialog) => dialog.accept())

    // Hover to reveal the delete button (opacity-0 -> group-hover:opacity-100)
    await sessionRow.hover()

    // The delete button inside the row has title="Delete session"
    const deleteBtn = sessionRow.locator('[title="Delete session"]')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click()

    // ── Assertion 1 (UI): session row disappears from the sidebar ──────────
    await expect(sessionRow).not.toBeVisible({ timeout: 10000 })

    // ── Assertion 2 (API): GET /sessions/{session_id} returns 404 ──────────
    // Allow a brief moment for the server-side delete to propagate
    await page.waitForTimeout(500)
    const { status } = await apiGetRaw(page.request, `/sessions/${sessionId}`)
    expect(status, `GET /sessions/${sessionId} should return 404 after delete`).toBe(404)
  })
})
