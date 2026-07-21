import { COMPUTE_TIERS, ComputeTierId, PlanTierId } from '@/data/billing/compute-tiers.display'

import { ComputeTierCard } from './ComputeTierCard'

interface Props {
  planTier: PlanTierId
  value: ComputeTierId
  onSelect: (id: ComputeTierId) => void
  excludeCurrent?: ComputeTierId
  /** Tier ids the caller is not entitled to — rendered locked (greyed + Lock). */
  lockedTierIds?: string[]
  /** Hover reason shown on each locked card. */
  lockedReason?: string
}

export function ComputeTierPicker({
  planTier,
  value,
  onSelect,
  excludeCurrent,
  lockedTierIds,
  lockedReason,
}: Props) {
  const tiers = COMPUTE_TIERS.filter((t) => t.id !== excludeCurrent)
  // Stacked, full-width "wide" cards — same card style as the Infrastructure
  // tab's compute picker. The create-project column is too narrow to place two
  // wide cards side by side (the wide card switches to a horizontal layout with
  // a fixed name column at sm+), so a single column keeps each tier readable
  // instead of squeezing all five into one cramped row.
  return (
    <div className="flex flex-col gap-3">
      {tiers.map((tier) => (
        <ComputeTierCard
          key={tier.id}
          tier={tier}
          planTier={planTier}
          variant="wide"
          selected={value === tier.id}
          isFreeSandbox={Boolean(tier.sandboxSubsidy)}
          onClick={() => onSelect(tier.id)}
          disabled={lockedTierIds?.includes(tier.id)}
          lockedReason={lockedReason}
        />
      ))}
    </div>
  )
}
