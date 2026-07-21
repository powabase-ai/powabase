import { useRouter } from 'next/router'
import { Tooltip, TooltipContent, TooltipTrigger } from 'ui'

import { useCreditsLimitsQuery } from '@/data/credits/limits-query'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { formatBillingAmount } from '@/lib/billing-units'
import { daysFromNow, dayWord } from '@/lib/credits/format'

function colorClass(balance: number, monthlyCredits: number): string {
  if (monthlyCredits === 0) return ''
  const pct = balance / monthlyCredits
  if (pct <= 0.1) return 'text-red-500'
  if (pct <= 0.5) return 'text-yellow-500'
  return ''
}

export function CreditBar() {
  const enabled = useIsFeatureEnabled('credits:enabled')
  const router = useRouter()
  // useParams().slug only exists on /org/<slug>/* URLs — on /project/<ref>/*
  // pages it's undefined and the bar disappears. useSelectedOrganizationQuery
  // resolves the org from EITHER the org-slug URL param OR the project's
  // organization_id, so the bar stays visible across both surfaces.
  const { data: org } = useSelectedOrganizationQuery()
  const slug = org?.slug

  // Single source: /credits/limits returns {org_id, plan_id,
  // monthly_credits, balance, renews_at} — everything the bar needs.
  // Using two queries (balance + limits) is duplicate fetching with
  // a real drift surface (the two cache entries can disagree if a
  // charge lands between their polls).
  const { data: limits, isError } = useCreditsLimitsQuery(slug, { enabled })

  if (!enabled) return null
  if (!slug) return null

  if (isError) {
    return <CreditBarError />
  }

  // Loading
  if (!limits) {
    return (
      <div data-testid="credit-bar" className="text-sm text-foreground-lighter px-2">
        … / —
      </div>
    )
  }

  const bal = limits.balance

  // Non-refilling credit (the free plan's one-time grant, migration 0014):
  // show the balance alone — no monthly cap, no reset date. Key on the actual
  // capability (monthly_credits, the same value ensure_refill gates on) rather
  // than plan_id, so this header and the usage page can't disagree for an
  // unknown or zero-allowance plan — both derive "does it refill" from this.
  if (limits.monthly_credits <= 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-testid="credit-bar"
            onClick={() => router.push(`/org/${slug}/usage`)}
            className="text-sm px-2 py-1"
          >
            {formatBillingAmount(bal)}
          </button>
        </TooltipTrigger>
        <TooltipContent role="tooltip">Your credit balance · doesn't expire</TooltipContent>
      </Tooltip>
    )
  }

  // Refilling plans: a monthly allowance that resets on renews_at.
  const cap = limits.monthly_credits // > 0 here (the <= 0 case returned above)
  // Defensive: CP may return a payload missing or unparseable renews_at
  // on a degraded path (e.g. billing_returned_non_json fallback). Splitting
  // `undefined` would kill the entire LayoutHeader, and an unparseable
  // string like "garbage" passes typeof === 'string' but produces NaN
  // downstream — bail to the error chrome in both cases.
  const days =
    typeof limits.renews_at === 'string' ? daysFromNow(limits.renews_at) : null
  if (days === null) {
    return <CreditBarError />
  }
  const dateOnly = limits.renews_at.split('T')[0]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          data-testid="credit-bar"
          onClick={() => router.push(`/org/${slug}/usage`)}
          className={`text-sm px-2 py-1 ${colorClass(bal, cap)}`}
        >
          {formatBillingAmount(bal)} of {formatBillingAmount(cap)} this month
        </button>
      </TooltipTrigger>
      <TooltipContent role="tooltip">
        Resets in {days} {dayWord(days)} ({dateOnly})
      </TooltipContent>
    </Tooltip>
  )
}

export function CreditBarError() {
  // Distinct error state — render em-dash + tooltip
  const enabled = useIsFeatureEnabled('credits:enabled')
  if (!enabled) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-testid="credit-bar" className="text-sm text-foreground-lighter px-2">
          —
        </span>
      </TooltipTrigger>
      <TooltipContent>Couldn't fetch balance — try refreshing</TooltipContent>
    </Tooltip>
  )
}
