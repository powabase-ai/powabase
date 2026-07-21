import Link from 'next/link'
import { Alert_Shadcn_, AlertDescription_Shadcn_, AlertTitle_Shadcn_ } from 'ui'

import { type PlanTierId } from '@/data/billing/compute-tiers.display'
import { useOrgWalletQuery } from '@/data/billing/wallet-query'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { millicentsToUsd } from '@/lib/billing-units'

/**
 * Global low-balance / exhausted banner. Reuses the exact thresholds from
 * WalletPanel (exhausted: balance ≤ 0; low: balance ≤ 10% of the monthly grant).
 * Powabase-native — it does NOT use the Supabase restriction plumbing
 * (useOrganizationRestrictions / OrganizationResourceBanner), confirmed inert
 * for Powabase (F1 design R1).
 */
export function WalletBalanceBanner() {
  const { data: org } = useSelectedOrganizationQuery()
  const billingUiEnabled = useIsBillingUiEnabled(org)
  const { data: wallet } = useOrgWalletQuery(org?.slug)

  if (!org || !billingUiEnabled || !wallet) return null

  const exhausted = wallet.balance_millicents <= 0
  const low =
    wallet.monthly_grant_millicents > 0 &&
    wallet.balance_millicents <= 0.1 * wallet.monthly_grant_millicents
  if (!exhausted && !low) return null

  const balanceUsd = `$${millicentsToUsd(wallet.balance_millicents).toFixed(2)}`

  return (
    <Alert_Shadcn_
      data-testid="wallet-balance-banner"
      variant={exhausted ? 'destructive' : 'warning'}
      className="rounded-none border-x-0 border-t-0"
    >
      <AlertTitle_Shadcn_>
        {exhausted ? 'Credits exhausted' : 'Credit balance is low'}
      </AlertTitle_Shadcn_>
      <AlertDescription_Shadcn_ className="flex flex-wrap items-center gap-x-3">
        <span>
          {exhausted
            ? `AI operations are paused until you top up (${balanceUsd}).`
            : `Your balance is ${balanceUsd}.`}
        </span>
        <Link href={`/org/${org.slug}/billing`} className="font-medium underline">
          Add credits
        </Link>
        {(org.plan?.id as PlanTierId | undefined) !== 'scale' && (
          <Link href={`/org/${org.slug}/billing#powabase-plan-picker`} className="font-medium underline">
            Upgrade
          </Link>
        )}
      </AlertDescription_Shadcn_>
    </Alert_Shadcn_>
  )
}
