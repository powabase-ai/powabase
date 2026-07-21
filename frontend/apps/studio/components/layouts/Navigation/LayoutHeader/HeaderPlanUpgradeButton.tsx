import Link from 'next/link'
import { Button } from 'ui'

import { type PlanTierId } from '@/data/billing/compute-tiers.display'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'

/**
 * Powabase desktop "Upgrade" badge in the global header. Shows for orgs below
 * Scale when the billing UI is enabled; deep-links to the billing plan-picker
 * anchor. Renders `hidden md:flex` (desktop-only) — baking that class into the
 * component (rather than passing it at the mount site) makes the desktop-only
 * contract un-forgettable and unit-testable. On mobile, `MobileNavigationBar`
 * (itself `md:hidden`) carries its own experiment-gated `HeaderUpgradeButton`;
 * the two are on mutually-exclusive breakpoints and never co-render.
 */
export function HeaderPlanUpgradeButton() {
  const { data: org } = useSelectedOrganizationQuery()
  const billingUiEnabled = useIsBillingUiEnabled(org)

  if (!org) return null
  if (!billingUiEnabled) return null
  // org.plan.id's upstream Supabase union omits Powabase's real tiers; cast to
  // the real PlanTierId (which includes 'scale') so the check stays typo-safe.
  if ((org.plan?.id as PlanTierId | undefined) === 'scale') return null

  return (
    <Button asChild type="primary" size="tiny" className="hidden md:flex">
      <Link href={`/org/${org.slug}/billing#powabase-plan-picker`}>Upgrade</Link>
    </Button>
  )
}
