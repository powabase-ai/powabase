import type { CreditsLimits } from '@/data/credits/limits-query'

/**
 * Normalized shape for credit usage display on the Usage page.
 *
 * Deliberately minimal — carries only what the Usage page credit section
 * needs. Named to match the spec (Component 2) but intentionally different
 * from any upstream Supabase Stripe type; this fork's Usage page is a
 * custom observability page with no UsageBarChart / AttributeUsage
 * components. If those components are ever introduced they can consume
 * this same type.
 */
export type UsageCategoryItem = {
  key: string
  label: string
  /**
   * Credits remaining (not consumed), in millicents. Aligns with the
   * top-header credit-bar framing ("X / Y this month" reads as "X
   * remaining of Y monthly"). Smoke obs #1 caught the previous `used`
   * framing conflicting with the bar — pick one and stick to it.
   * Renderers display via `formatBillingAmount` (no `unit` field —
   * PR 416 C9: the only unit is $ from millicents).
   */
  remaining: number
  limit: number
  /**
   * Billing cadence — the single signal for "does this refill". ``'one-off'``
   * marks a non-refilling balance (the free plan's one-time grant;
   * monthly_credits === 0, migration 0014) and renderers then show the balance
   * alone with no cap/reset. ``'month'`` (etc.) marks a refilling allowance.
   * Derived from monthly_credits — the same value the top-header credit bar
   * keys on — so the two surfaces never disagree.
   */
  period: 'month' | 'day' | 'hour' | 'one-off'
  renews_at: string
  status: 'ok' | 'warning' | 'exceeded'
}

/**
 * Map /credits/limits → UsageCategoryItem[].
 *
 * Returns a single-element array because credits are tracked as one
 * org-level bucket. Extend here when per-category limits exist.
 *
 * Status thresholds (per spec decision #7 canonical gate pattern):
 *   exceeded  — balance ≤ 0
 *   warning   — balance ≤ 20 % of monthly allotment
 *   ok        — otherwise
 *
 * Note: `remaining` may exceed `limit` when the org has admin grants
 * on top of the monthly refill (5995 with a 5000 cap is legitimate).
 * The bar fill clamps to 100 % at the limit but the label shows the
 * actual remaining value.
 */
export function adaptLimitsToUsageItems(limits: CreditsLimits): UsageCategoryItem[] {
  let status: UsageCategoryItem['status'] = 'ok'
  if (limits.balance <= 0) {
    status = 'exceeded'
  } else if (limits.monthly_credits > 0 && limits.balance <= limits.monthly_credits * 0.2) {
    status = 'warning'
  }

  return [
    {
      key: 'credits',
      label: 'Credits',
      remaining: limits.balance,
      limit: limits.monthly_credits,
      period: limits.monthly_credits > 0 ? 'month' : 'one-off',
      renews_at: limits.renews_at,
      status,
    },
  ]
}
