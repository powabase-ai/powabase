import { test, expect } from "@playwright/test";

/**
 * E2E coverage for the ReasoningPill UX (issue #106 v2 design).
 *
 * These tests assume a fully-provisioned project with:
 *   - A reasoning-capable agent (Claude opus or GPT-5) with reasoning_effort=medium
 *   - Provider API keys configured
 *   - A tool that takes >1s so we can observe streaming
 *
 * Tests are marked with test.fixme where fixtures aren't yet wired in CI.
 * Local execution: ANTHROPIC_API_KEY=... npx playwright test reasoning-pill
 */

const TEST_PROJECT_REF = process.env.PLAYWRIGHT_PROJECT_REF ?? "<test-ref>";

test.describe("Reasoning pill", () => {
  test.fixme(
    !process.env.PLAYWRIGHT_PROJECT_REF,
    "Requires PLAYWRIGHT_PROJECT_REF env + provisioned agent with reasoning_effort"
  );

  test("renders pre-stream then streaming with step counter", async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_REF}/runs`);
    await page.fill('[data-testid="run-input"]', "Solve the train and platform meeting-point problem step by step");
    await page.click('[data-testid="run-submit"]');

    // Pre-stream pill appears
    await expect(page.getByText(/Thinking\.\.\./i).first()).toBeVisible();

    // Step counter increments during streaming
    await expect(
      page.getByText(/Thinking\.\.\.\s+·\s+\d+\s+step/i).first()
    ).toBeVisible({ timeout: 30000 });
  });

  test("auto-collapses to 'Thought for Xs' on completion and click expands", async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_REF}/runs`);
    await page.fill('[data-testid="run-input"]', "Quick reasoning check");
    await page.click('[data-testid="run-submit"]');

    // Wait for completion
    await expect(page.getByText(/Thought for/i).first()).toBeVisible({
      timeout: 60000,
    });

    // Click expands
    await page.getByText(/Thought for/i).first().click();
    // Some step content should now be visible (specific text varies by run; just check pill body opens)
    await expect(page.locator(".whitespace-pre-wrap").first()).toBeVisible();
  });

  test("activity feed contains no reasoning rows", async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_REF}/runs`);
    await page.fill('[data-testid="run-input"]', "Test feed has no 💭 emoji rows");
    await page.click('[data-testid="run-submit"]');

    // Wait for activity feed to populate
    await page.waitForSelector(".animate-activity-in", { timeout: 30000 });

    // No row should contain the old ReasoningRow's 💭 emoji marker
    const activityItems = page.locator(".animate-activity-in");
    const count = await activityItems.count();
    for (let i = 0; i < count; i++) {
      const text = await activityItems.nth(i).textContent();
      expect(text).not.toContain("💭");
    }
  });

  test.fixme("done-empty state shows no-summary message on expand", async ({ page }) => {
    // Requires fixture: agent on a non-reasoning model (e.g., gpt-4o) with
    // reasoning_effort set (precheck drops it; FE renders done-empty if
    // reasoning_requested is true). Currently no fixture; manually verifiable.
  });

  test.fixme("done-redacted state shows safety message on expand", async ({ page }) => {
    // Requires fixture: a Claude run that produces redacted_thinking blocks.
    // Use ANTHROPIC_MAGIC_STRING_TRIGGER_REDACTED_THINKING_46C9A13E... in the
    // user message to trigger redaction. Setup involves real Anthropic key
    // and a reasoning-capable agent.
  });

  test.fixme("step_reset clears partial reasoning on retry", async ({ page }) => {
    // Hard to reliably trigger model_fallback / reactive_compact / output_recovery
    // in an automated test. Manually verifiable by injecting a low rate limit.
  });

  test.fixme("Stop button mid-stream drains visible chars to current target", async ({ page }) => {
    await page.goto(`/project/${TEST_PROJECT_REF}/runs`);
    await page.fill('[data-testid="run-input"]', "Long task with multiple steps");
    await page.click('[data-testid="run-submit"]');
    await page.waitForTimeout(500);
    await page.click('[data-testid="run-stop"]');
    const before = await page.locator('[data-testid="assistant-bubble"]').first().textContent();
    await page.waitForTimeout(2000);
    const after = await page.locator('[data-testid="assistant-bubble"]').first().textContent();
    expect(after).toBe(before);
  });

  test.fixme("regenerate snaps pill to empty and restarts", async ({ page }) => {
    // Requires regenerate UI affordance — verify it exists, otherwise skip.
  });
});

test.describe("Reasoning pill — visual smoothness (manual QA)", () => {
  test.fixme(true, "Visual; covered by manual QA on Anthropic claude-opus-4-7");
});
