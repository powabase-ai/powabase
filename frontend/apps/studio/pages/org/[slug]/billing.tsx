import { BillingSettings } from '@/components/interfaces/Organization/BillingSettings/BillingSettings'
import DefaultLayout from '@/components/layouts/DefaultLayout'
import OrganizationLayout from '@/components/layouts/OrganizationLayout'
import type { NextPageWithLayout } from '@/types'

// PR #499 R3: replace the redirect stub with a real billing page so the
// 'billing:plan_picker' feature flag actually surfaces UI. BillingSettings
// is self-contained (no required props; reads slug + subscription via
// hooks), renders its own ScaffoldContainer chrome, and gates the entire
// surface behind 'billing:all' (BYOC fallback alert when off).
//
// Layout mirrors `usage.tsx` (DefaultLayout + OrganizationLayout) — both
// are flat top-level org pages, not nested under /settings. All in-app
// links (UpgradePlanButton, TaxIdBanner, etc.) already target
// /org/<slug>/billing; this page is the landing target.
const OrgBillingPage: NextPageWithLayout = () => {
  return <BillingSettings />
}

OrgBillingPage.getLayout = (page) => (
  <DefaultLayout>
    <OrganizationLayout title="Billing">{page}</OrganizationLayout>
  </DefaultLayout>
)

export default OrgBillingPage
