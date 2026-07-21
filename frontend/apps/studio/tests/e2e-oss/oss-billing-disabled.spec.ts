import { test, expect } from '@playwright/test'

// C3.1 — NEXT_PUBLIC_DISABLED_FEATURES=billing:all,billing:plan_picker,credits:enabled
// (oss-edition/docker-compose.yml studio build.args + environment; the value is baked
// into the Next.js bundle at build time via the Dockerfile ARG/ENV pair — see
// apps/studio/Dockerfile and oss-edition/tests/test_studio_disabled_features.py for the
// static pin that the build-time wiring, not just the runtime env, is in place).
//
// Self-hosted Studio (IS_PLATFORM=false) fabricates a fake logged-in session
// (packages/common/auth.tsx alwaysLoggedIn) and a fake org
// (pages/api/platform/organizations/index.ts returns a single hardcoded
// { slug: 'default-org-slug', plan: { id: 'enterprise' } }), so org-scoped
// pages render without a real control plane.
//
// Run with:
//   PLAYWRIGHT_OSS_BASE_URL=http://localhost:${KONG_HTTP_PORT} \
//   OSS_DASHBOARD_USERNAME=$DASHBOARD_USERNAME OSS_DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD \
//   npx playwright test --config=playwright.oss.config.ts oss-billing-disabled.spec.ts
// (values come from oss-edition/.env, written by gen-keys.py)

const ORG_SLUG = 'default-org-slug' // upstream self-host stub, pages/api/platform/organizations/index.ts

test('org sidebar omits Billing & Plans when billing:all is disabled', async ({ page }) => {
  // components/interfaces/Sidebar.tsx buildOrgNavItems() only includes the
  // 'Billing & Plans' link when showBilling (billing:all) AND
  // billingUiEnabled (billing:plan_picker) are both true. OrganizationLinks
  // (the component that renders it) only mounts on org-level pages with no
  // project ref in the URL, hence /org/<slug> rather than /project/default.
  await page.goto(`/org/${ORG_SLUG}`)
  await page.waitForLoadState('domcontentloaded')

  // Sanity: prove the sidebar itself rendered (org data resolved), so an
  // absent link below means "gated off", not "page never loaded".
  await expect(page.getByRole('link', { name: 'Organization Settings' })).toBeVisible({
    timeout: 15000,
  })

  await expect(page.getByRole('link', { name: 'Billing & Plans' })).toHaveCount(0)
})

test('billing page renders the BYOC-operator fallback, not the plan picker', async ({ page }) => {
  // components/interfaces/Organization/BillingSettings/BillingSettings.tsx:
  // !billingAllEnabled short-circuits to a bespoke "managed by your
  // operator" Alert instead of CheckoutResultBanner/GraceBanner/
  // WalletPanel/ManageSubscriptionPanel/PowabasePlanCards/ComputePricingPanel
  // (all wrapped in ScaffoldContainer id="powabase-plan-picker").
  await page.goto(`/org/${ORG_SLUG}/billing`)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByText('Billing is managed by your operator')).toBeVisible({
    timeout: 15000,
  })
  await expect(
    page.getByText(
      'This deployment is on a self-hosted (BYOC) plan. Subscription, invoices, and payment methods are handled by your operator outside of this UI.'
    )
  ).toBeVisible()

  await expect(page.locator('#powabase-plan-picker')).toHaveCount(0)
})

test('usage page omits the Credits section when credits:enabled is disabled', async ({
  page,
}) => {
  // pages/org/[slug]/usage.tsx: the "Credits" <h2> section (+ "View
  // pricing ->" link into /org/<slug>/credits/pricing) only renders when
  // creditsEnabled (credits:enabled) is true.
  await page.goto(`/org/${ORG_SLUG}/usage`)
  await page.waitForLoadState('domcontentloaded')

  // Sanity: prove the page itself rendered past loading, so an absent
  // section below means "gated off", not "page never loaded".
  await expect(page.getByRole('heading', { name: 'Organization usage', level: 1 })).toBeVisible({
    timeout: 15000,
  })

  await expect(page.getByRole('heading', { name: 'Credits', level: 2 })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'View pricing' })).toHaveCount(0)
})
