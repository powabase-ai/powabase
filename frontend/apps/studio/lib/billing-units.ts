/**
 * Display unit helpers for the v1.5 millicent-based ledger.
 * 1 millicent = $0.00001. Internal API returns millicent integers;
 * FE divides by 100_000 to display as $.
 */

export const millicentsToUsd = (mc: number): number => mc / 100_000

/** Inverse of millicentsToUsd — dollars (e.g. a spend-cap input) to millicents. */
export const usdToMillicents = (usd: number): number => Math.round(usd * 100_000)

export const formatBillingAmount = (mc: number): string => {
  if (mc === 0) return '$0.00'
  const sign = mc < 0 ? '-' : ''
  const usd = Math.abs(mc) / 100_000
  if (usd >= 0.01) return `${sign}$${usd.toFixed(2)}`
  if (usd >= 0.0001) return `${sign}$${usd.toFixed(4)}`
  return `${sign}<$0.0001`
}
