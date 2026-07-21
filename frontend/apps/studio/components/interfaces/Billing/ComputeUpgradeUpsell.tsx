import Link from 'next/link'
import { Admonition } from 'ui-patterns/admonition'

import type { PlanTierId } from '@/data/billing/compute-tiers.display'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'

const NEXT_PLAN: Record<
  Exclude<PlanTierId, 'scale'>,
  { name: string; savings: string; current: string }
> = {
  free: { name: 'Self-Serve', savings: '15% cheaper compute + lower overage', current: 'Free' },
  'self-serve': {
    name: 'Scale',
    savings: '20% cheaper compute + the lowest overage',
    current: 'Self-Serve',
  },
}

/** Soft upsell shown in the compute picker / resize modal for orgs below Scale. */
export function ComputeUpgradeUpsell({ planTier }: { planTier: PlanTierId }) {
  const { data: org } = useSelectedOrganizationQuery()
  // Self-gate (defense-in-depth): both mount sites are already billing-UI-gated,
  // but gating here keeps the contract self-enforcing if mounted elsewhere.
  const billingUiEnabled = useIsBillingUiEnabled(org)
  if (!billingUiEnabled) return null
  if (planTier === 'scale') return null
  const next = NEXT_PLAN[planTier as Exclude<PlanTierId, 'scale'>]
  if (!next || !org) return null

  return (
    <Admonition
      type="default"
      title={`You're on ${next.current} compute rates`}
      description={
        <span>
          {next.name} is {next.savings}.{' '}
          <Link
            href={`/org/${org.slug}/billing#powabase-plan-picker`}
            className="text-brand hover:underline"
          >
            Upgrade to {next.name} →
          </Link>
        </span>
      }
    />
  )
}
