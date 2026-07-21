import { test, expect } from '@playwright/test'

// C1.2 — OSS single-project stack (oss-edition/docker-compose.yml), Studio built
// NEXT_PUBLIC_IS_PLATFORM=false, reached through Kong's `dashboard` route
// (basic-auth via playwright.oss.config.ts's httpCredentials — see that file).
//
// Run with:
//   PLAYWRIGHT_OSS_BASE_URL=http://localhost:${KONG_HTTP_PORT} \
//   OSS_DASHBOARD_USERNAME=$DASHBOARD_USERNAME OSS_DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD \
//   npx playwright test --config=playwright.oss.config.ts
// (values come from oss-edition/.env, written by gen-keys.py)
//
// Scope (per the C1.2 brief): verify the NON-AI data paths — Table Editor and
// SQL Editor, both proxied server-side through lib/api/self-hosted/* to
// STUDIO_PG_META_URL — work against the local stack. The AI pages
// (agents/sources/knowledge-bases/orchestrations/workflows/runs) read AI data
// through project-service `/api/*` endpoints (lib/ai-api.ts) — as of C4.1,
// getProjectApiBaseUrl() routes those same-origin in self-host to
// pages/api/platform/project-api/[ref]/[...path].ts, a Studio server-side
// proxy that injects the local service_role credential (no control plane,
// no per-user browser token required). The last test below proves that
// round-trip actually loads data instead of asserting the pre-C4.1 gap.

const TABLE_NAME = 'pw_smoke_test'
const NOTE_VALUE = 'playwright-oss-c1-2'

// Types SQL into the Monaco editor via real keystrokes (the standard way to
// drive Monaco under Playwright — it captures input through a focused hidden
// textarea). The two statements below use only single, non-nested paren
// pairs and $$-dollar-quoting (not '...') specifically so Monaco's default
// bracket/quote auto-closing can't corrupt them: typing `)` or the closing
// `$$` when Monaco already auto-inserted one is Monaco's standard "type-over"
// behavior, which only reliably holds for this simple, non-nested shape.
async function runSql(page: import('@playwright/test').Page, sql: string) {
  await page.goto('/project/default/sql/new')
  await page.waitForLoadState('domcontentloaded')

  const editor = page.locator('.monaco-editor').first()
  await editor.click()
  await page.keyboard.type(sql)

  await page.getByTestId('sql-run-button').click()
}

test.describe.serial('Non-AI data paths load against the local OSS stack', () => {
  test('SQL Editor creates a table (pg-meta /query write path)', async ({ page }) => {
    await runSql(
      page,
      `create table if not exists public.${TABLE_NAME} (id integer primary key, note text);`
    )

    // A wrong POSTGRES_PASSWORD or PG_META_CRYPTO_KEY on the studio service
    // makes every pg-meta /query call fail Postgres auth / header decryption —
    // UtilityTabResults.tsx renders that as "Error: ..." text. Assert it's
    // absent, then assert the DDL's actual success state (no rows returned).
    await expect(page.getByText(/^Error:/)).toHaveCount(0, { timeout: 15000 })
    await expect(page.getByText('Success. No rows returned')).toBeVisible({ timeout: 15000 })
  })

  test('SQL Editor upserts a row (pg-meta /query write path)', async ({ page }) => {
    await runSql(
      page,
      `insert into public.${TABLE_NAME} (id, note) values (1, $$${NOTE_VALUE}$$)\n` +
        `on conflict (id) do update set note = excluded.note;`
    )

    await expect(page.getByText(/^Error:/)).toHaveCount(0, { timeout: 15000 })
    await expect(page.getByText('Success. No rows returned')).toBeVisible({ timeout: 15000 })
  })

  test('Table Editor lists the table and loads its row (pg-meta /query read path)', async ({
    page,
  }) => {
    await page.goto('/project/default/editor')
    await page.waitForLoadState('domcontentloaded')

    // EntityListItem.tsx: role="button" + aria-label={`View ${entity.name}`}.
    // Landing on /editor with no ?schema= defaults to 'public'
    // (useSchemaQueryState.ts), so the table created above is listed directly.
    const tableLink = page.getByRole('button', { name: `View ${TABLE_NAME}`, exact: true })
    await expect(tableLink).toBeVisible({ timeout: 15000 })
    await tableLink.click()

    // react-data-grid renders cells with the `.rdg-cell` class
    // (Results-equivalent grid for Table Editor — SupabaseGrid). Finding the
    // upserted note proves getTableEditor()/getTableRows() (both pg-meta
    // /query calls) round-tripped through the real Postgres data.
    await expect(page.locator('.rdg-cell', { hasText: NOTE_VALUE })).toBeVisible({
      timeout: 15000,
    })
  })
})

test('AI-page nav loads real data via the self-host project-api proxy (C4.1 — was a known gap through C1.2/C2.1)', async ({
  page,
}) => {
  // Was: hooks/ai/useProjectSupabaseClient.ts pointed at
  // `${NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/platform/project-api/{ref}`
  // (the control plane, which OSS never runs) and gated every AI query on a
  // GoTrue access_token that never resolves under self-host's alwaysLoggedIn
  // placeholder session — so the fetch never even fired (see git history of
  // this file for the C1.2-era version of this test, which asserted that
  // absence).
  //
  // Now (C4.1): lib/ai-api.ts's getProjectApiBaseUrl() returns a same-origin
  // relative path in self-host (/api/platform/project-api/{ref}), served by
  // pages/api/platform/project-api/[ref]/[...path].ts — a Studio server-side
  // proxy that injects SUPABASE_SERVICE_KEY and forwards to the local
  // project-service via Kong. And hasAiAuth() (lib/ai-api.ts) drops the
  // per-user-token requirement in self-host, so usePaginatedList's query
  // fires once the page itself is ready, regardless of the (permanently
  // empty) browser token. This test proves the fetch now actually happens
  // and completes successfully — not just that the page renders.
  const projectApiRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/platform/project-api/')) projectApiRequests.push(req.url())
  })
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/platform/project-api/') && res.url().includes('/agents'),
    { timeout: 15000 }
  )

  await page.goto('/project/default/agents')
  await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({
    timeout: 15000,
  })

  const response = await responsePromise
  expect(
    projectApiRequests.some((url) => url.includes('/project-api/default/agents')),
    'expected the Agents list to fetch through the same-origin self-host proxy at ' +
      '/api/platform/project-api/default/agents — got: ' + JSON.stringify(projectApiRequests)
  ).toBe(true)
  // 200, not gated-off-and-silent and not a proxy failure (401/404/503).
  expect(response.status()).toBe(200)

  // The local stack's DB starts empty (fresh smoke-test boot), so the
  // correct rendering of a *successful* empty response is the same "No
  // agents yet" copy — the difference from the old gap is that this is now
  // reached via a real round-trip (asserted above), not a permanently
  // disabled query. Absence of an error banner rules out the response
  // having been a disguised failure that also happens to render emptily.
  await expect(page.getByText('No agents yet')).toBeVisible()
  await expect(page.getByText(/^Error:/)).toHaveCount(0)
})

test('AI-page mutation round-trips through the self-host project-api proxy (C4.2 — create + delete an agent)', async ({
  page,
}) => {
  // C4.1 (previous test) proved the LOAD path: GET /agents fires through the
  // proxy and returns real data. C4.1 deliberately left every *action*
  // handler (create/update/delete) still gated on `if (!token) return` — see
  // that commit's "deliberately out of scope" note — so the create/delete
  // buttons on this exact page were silently inert under self-host even
  // though the list rendered. C4.2 relaxed those geniune auth-token guards
  // the same way (hasAiAuth), so this test proves POST and DELETE now also
  // round-trip — persisted server-side (survives a full page reload, not
  // just an optimistic client-side list splice), not merely "the button is
  // clickable."
  const agentName = `pw-oss-c4-2-${Date.now()}`

  await page.goto('/project/default/agents')
  await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({
    timeout: 15000,
  })
  // The heading renders before React hydration attaches this page's click
  // handlers (it's static text), so waiting on it alone isn't a reliable
  // "the page is interactive" signal — clicking too early can hit a button
  // with no listener attached yet. Wait for the list's own data fetch to
  // resolve first (same signal the C4.1 test above uses via waitForResponse):
  // it can only render post-hydration, since usePaginatedList's fetch fires
  // from a mounted-component effect.
  await expect(page.getByText('No agents yet')).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: 'Create agent' }).click()
  await page.locator('#create-agent-name').fill(agentName)

  const createResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/platform/project-api/default/agents') &&
      res.request().method() === 'POST',
    { timeout: 15000 }
  )
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  const createResponse = await createResponsePromise
  // routes/agents.py create_agent returns 201 on success; a still-blocked
  // guard would mean this request never fires at all (waitForResponse times
  // out) rather than a non-2xx status, so the timeout above is itself part
  // of this assertion.
  expect(createResponse.status()).toBe(201)

  // Modal closes on success and the list query is invalidated — the new
  // agent should appear without a manual reload.
  await expect(page.getByText(agentName)).toBeVisible({ timeout: 15000 })

  // Reload to rule out optimistic/client-only state: this re-fetches the
  // list from scratch through the proxy, proving the row is real, persisted
  // Postgres data, not just React state that never left the browser.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByText(agentName)).toBeVisible({ timeout: 15000 })

  // Delete it via the card's trash-icon button (title="Delete"). The button
  // is a sibling of the card's full-bleed <Link>, not a descendant of it
  // (HorizontalCard.tsx: nesting <button> inside <a> is invalid HTML, so
  // `actions` renders as an absolutely-positioned sibling in the same
  // wrapper) — so scope by the wrapper that directly contains the card's
  // `aria-label`-tagged Link, not by an anchor-text locator.
  // confirm() is a native dialog under self-host too (no bespoke confirm
  // modal).
  page.once('dialog', (dialog) => dialog.accept())
  const deleteResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/platform/project-api/default/agents/') &&
      res.request().method() === 'DELETE',
    { timeout: 15000 }
  )
  const card = page.locator(`div:has(> a[aria-label="${agentName}"])`)
  await card.getByTitle('Delete').click()
  const deleteResponse = await deleteResponsePromise
  expect(deleteResponse.status()).toBe(200)

  await expect(page.getByText(agentName)).toHaveCount(0)

  // Reload again — proves the delete is real (server-side), not merely a
  // client-side row removal that would reappear on refetch.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByText(agentName)).toHaveCount(0)
})

test('Runs page loads agents + sessions via the self-host project-api proxy (coverage-miss followup — this page predates C4.1/C4.2 and was never migrated)', async ({
  page,
}) => {
  // pages/project/[ref]/runs/index.tsx was missed by both C4.1 and C4.2 — it
  // still gated fetchAgents/fetchOrchestrations/fetchKbs/fetchSessions/
  // fetchMessages/handleSend/handleDeleteSession (12 sites, plus 2 more
  // inside handleSend's stream-completion callback) on `!token`/`token`
  // truthiness the same way the Agents page did pre-C4.1. Since self-host's
  // `token` is permanently `''` (useProjectSupabaseClient.ts), every one of
  // those bailed unconditionally — the nav-linked "Runs" page was fully dead
  // in OSS. This test proves the load path (fetchAgents -> auto-select ->
  // fetchSessions) now round-trips real data through the proxy, the same way
  // the C4.1 test above proves it for the Agents page. It deliberately does
  // NOT exercise handleSend — that streams a real LLM call through whatever
  // BYOK key is in oss-edition/.env, which this suite avoids invoking.
  const agentName = `pw-oss-runs-followup-${Date.now()}`

  // Create an agent first (metadata-only insert, no LLM call) so the Runs
  // page's picker has something to auto-select — with zero agents,
  // fetchSessions bails on `!selectedAgentId` before its own network call
  // fires, which would leave this test unable to observe that guard passing.
  await page.goto('/project/default/agents')
  await expect(page.getByText('No agents yet')).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Create agent' }).click()
  await page.locator('#create-agent-name').fill(agentName)
  const createResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/platform/project-api/default/agents') &&
      res.request().method() === 'POST',
    { timeout: 15000 }
  )
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  const { id: agentId } = await createResponse.json()

  try {
    const sessionsResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/platform/project-api/default/agents/${agentId}/sessions`),
      { timeout: 15000 }
    )

    await page.goto('/project/default/runs')
    // ResizableLayout renders leftPanelTitle="Runs" as an <h3> (see
    // pages/project/[ref]/runs/index.tsx) — this page has no <h1>.
    await expect(page.getByRole('heading', { name: 'Runs', level: 3 })).toBeVisible({
      timeout: 15000,
    })

    // The agent picker <select> auto-selects the only agent once fetchAgents
    // resolves ("default to first agent" effect) — its value resolving to
    // our created agentId proves fetchAgents' guard no longer bails on the
    // always-empty self-host token.
    const agentPicker = page
      .locator('select')
      .filter({ has: page.locator(`option[value="${agentId}"]`) })
    await expect(agentPicker).toHaveValue(agentId, { timeout: 15000 })

    // fetchSessions only fires once selectedAgentId auto-populates, so
    // observing its GET here proves that guard's hasAiAuth() check passes
    // too, not just fetchAgents'.
    const sessionsResponse = await sessionsResponsePromise
    expect(sessionsResponse.status()).toBe(200)

    await expect(page.getByText(/^Error:/)).toHaveCount(0)
  } finally {
    // Clean up via the proxy directly — the Runs page has no agent-delete
    // affordance of its own.
    await page.request.delete(`/api/platform/project-api/default/agents/${agentId}`)
  }
})

// Thin per-page load coverage for the remaining nav-reachable AI pages
// (Agents and Runs are already covered above). Each of these list pages
// shares the Agents page's shape: a usePaginatedList/useInfiniteQuery fetch
// through the same self-host project-api proxy, gated only by hasAiAuth
// (which is unconditionally true in self-host — see lib/ai-api.ts). Mirrors
// the C4.1 test above but "thin": proves the specific list GET round-trips
// with a 200 (the authoritative "not silently gated off / not a disguised
// proxy failure" signal — status alone, not UI text, since none of these
// pages' error banners share a common literal prefix to assert against) and
// that the page then renders its real empty-state copy (the local stack's DB
// starts empty on a fresh smoke-test boot), not stuck on a loading spinner.
const AI_LIST_PAGES = [
  { path: 'knowledge-bases', heading: 'Knowledge Bases', endpoint: 'knowledge-bases', emptyText: 'No knowledge bases yet' },
  { path: 'sources', heading: 'Sources', endpoint: 'sources', emptyText: 'No sources yet' },
  { path: 'orchestrations', heading: 'Orchestrations', endpoint: 'orchestrations', emptyText: 'No orchestrations yet' },
  { path: 'workflows', heading: 'Workflows', endpoint: 'workflows', emptyText: 'No workflows yet' },
]

for (const { path, heading, endpoint, emptyText } of AI_LIST_PAGES) {
  test(`${heading} page loads real data via the self-host project-api proxy (coverage-miss followup)`, async ({
    page,
  }) => {
    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/platform/project-api/default/${endpoint}`) &&
        res.request().method() === 'GET',
      { timeout: 15000 }
    )

    await page.goto(`/project/default/${path}`)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({
      timeout: 15000,
    })

    const response = await responsePromise
    expect(response.status()).toBe(200)

    await expect(page.getByText(emptyText)).toBeVisible({ timeout: 15000 })
  })
}
