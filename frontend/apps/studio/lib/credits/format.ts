/**
 * Shared formatters for the credit-system FE surfaces.
 *
 * Lives here so the credit bar (top header), the 402 toast handler, and any
 * future surface that needs "days until refill" all use the same NaN-safe
 * parsing. Round-2 review flagged a divergent local copy of `daysFromNow`
 * in CreditBar that didn't have the NaN guard — extracting prevents future
 * drift.
 */

/**
 * Return the number of whole days from now until ``isoDate``. Returns
 * ``null`` when ``isoDate`` is not parseable — callers should treat null
 * as "unknown, drop the days clause" rather than rendering "NaN days".
 */
export function daysFromNow(isoDate: string): number | null {
  const target = new Date(isoDate).getTime()
  if (Number.isNaN(target)) return null
  const now = Date.now()
  return Math.max(0, Math.ceil((target - now) / (24 * 60 * 60 * 1000)))
}

export function dayWord(days: number): string {
  return days === 1 ? 'day' : 'days'
}
