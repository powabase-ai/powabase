/** Credit amounts are millicents on the basis-point scale: 100_000 = $1. */
const MILLICENTS_PER_DOLLAR = 100_000

/**
 * Format a millicents amount as a USD string, e.g. 1_234_567 → "$12.35".
 * Negative amounts (charges) render with a leading minus: -250 → "-$0.0025".
 * `dp` controls decimal places — 2 for balances, more for sub-cent charges.
 */
export function formatUsd(millicents: number, dp = 2): string {
  const dollars = millicents / MILLICENTS_PER_DOLLAR
  const sign = dollars < 0 ? "-" : ""
  return `${sign}$${Math.abs(dollars).toFixed(dp)}`
}
