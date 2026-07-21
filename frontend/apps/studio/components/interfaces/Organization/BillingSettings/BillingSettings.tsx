import { Alert_Shadcn_, AlertDescription_Shadcn_, AlertTitle_Shadcn_ } from 'ui'

import { CheckoutResultBanner } from './PowabasePlanPicker/CheckoutResultBanner'
import { ManageSubscriptionPanel } from './PowabasePlanPicker/ManageSubscriptionPanel'
import { PowabasePlanCards } from './PowabasePlanPicker/PowabasePlanCards'
import { ComputePricingPanel } from './ComputePricingPanel'
import type { PlanTierId } from '@/data/billing/compute-tiers.display'
import { WalletPanel } from './WalletPanel'
import {
  ScaffoldContainer,
  ScaffoldContainerLegacy,
  ScaffoldTitle,
} from '@/components/layouts/Scaffold'
import { useOrgSubscriptionQuery } from '@/data/subscriptions/org-subscription-query'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import { useIsBillingTestMode } from '@/hooks/misc/useIsBillingTestMode'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { GraceBanner } from './GraceBanner'
import { TestModeBanner } from './TestModeBanner'

// Note (B#6 fix): the prior draft imported `PartnerManagedResource` from
// `@/components/ui/PartnerManagedResource`, but that component's props are
// `resource: string` + required `managedBy: ManagedBy` (VERCEL_MARKETPLACE
// / AWS_MARKETPLACE / SUPABASE), and SUPABASE renders null. Powabase BYOC
// fits none of those enum values, so the BYOC fallback uses a bespoke
// Alert instead. Also: the `Subscription` import has been DROPPED — the
// old Supabase-cloud Subscription card is no longer mounted in the
// Powabase branch (the existing-Subscription orphan import would trip
// the lint).

export const BillingSettings = () => {
  const { billingAll: billingAllEnabled } = useIsFeatureEnabled(['billing:all'])

  const { data: org } = useSelectedOrganizationQuery()
  const { data: subscription } = useOrgSubscriptionQuery({ orgSlug: org?.slug })

  // Picker resolution prefers the per-org `enabled_features` allowlist set
  // by `/admin/orgs` over the bundled JSON default — see the hook.
  const isPlanPickerEnabled = useIsBillingUiEnabled(org)
  const isTestMode = useIsBillingTestMode(org)

  // BYOC fallback: when billing:all is OFF, the entire billing surface is
  // owned by the BYOC operator. Use a bespoke Alert rather than
  // PartnerManagedResource (B#6 — that component's enum doesn't include a
  // Powabase value; SUPABASE→null).
  if (!billingAllEnabled) {
    return (
      <>
        <ScaffoldContainerLegacy>
          <ScaffoldTitle>Billing</ScaffoldTitle>
        </ScaffoldContainerLegacy>
        <ScaffoldContainer id="partner-managed">
          <Alert_Shadcn_>
            <AlertTitle_Shadcn_>Billing is managed by your operator</AlertTitle_Shadcn_>
            <AlertDescription_Shadcn_>
              This deployment is on a self-hosted (BYOC) plan. Subscription,
              invoices, and payment methods are handled by your operator
              outside of this UI. Contact your operator for billing changes.
            </AlertDescription_Shadcn_>
          </Alert_Shadcn_>
        </ScaffoldContainer>
      </>
    )
  }

  const planId = org?.plan?.id ?? 'free'
  const isPaid = planId !== 'free'

  return (
    <>
      {isPlanPickerEnabled && <CheckoutResultBanner />}
      <ScaffoldContainerLegacy>
        <ScaffoldTitle>Billing</ScaffoldTitle>
      </ScaffoldContainerLegacy>
      {isPlanPickerEnabled && org && <GraceBanner slug={org.slug} />}
      {isTestMode && <TestModeBanner />}

      {/* B1 — Powabase plan picker + manage panel (replaces Supabase-cloud
           Subscription card). Gated behind billing:plan_picker (default OFF)
           for test-mode-in-prod rollout.
           B3 — WalletPanel (balance, spend cap, payment methods, top-up modal)
           ships via WalletPanel above ManageSubscriptionPanel.
           The following legacy Supabase-cloud billing sub-components remain
           intentionally unmounted: InvoicesSection, BillingEmail,
           BillingCustomerData, CostControl, BillingBreakdown — their backing
           CP endpoints are not implemented in the Powabase fork. */}
      {isPlanPickerEnabled && (
        <ScaffoldContainer id="powabase-plan-picker">
          {/* Stack the panels with consistent vertical rhythm so the
              subscription box, wallet, and plan picker aren't crunched
              together. */}
          <div className="space-y-8 py-2">
            {org && <WalletPanel slug={org.slug} />}
            {isPaid && subscription && (
              <ManageSubscriptionPanel
                slug={org!.slug}
                subscription={{
                  plan: subscription.plan,
                  current_period_end: subscription.current_period_end ?? null,
                  // The hand-written CP route returns these, but the generated
                  // openapi-fetch types don't include them yet (no spec regen).
                  cancel_at_period_end: (subscription as any).cancel_at_period_end ?? false,
                  cancel_at: (subscription as any).cancel_at ?? null,
                }}
              />
            )}
            {org && <PowabasePlanCards slug={org.slug} currentPlanId={planId} />}
            {org && <ComputePricingPanel slug={org.slug} planTier={planId as PlanTierId} />}
          </div>
        </ScaffoldContainer>
      )}
    </>
  )
}
