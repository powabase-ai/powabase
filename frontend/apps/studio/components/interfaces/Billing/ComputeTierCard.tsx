import { Check, Cpu, Factory, FlaskConical, Hammer, HardDrive, Lock, Network, Rocket, Users, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, cn, Tooltip, TooltipContent, TooltipTrigger } from 'ui'

import { useComputeSizesQuery } from '@/data/billing/compute-sizes-query'
import { ComputeTier, ComputeTierId, PlanTierId } from '@/data/billing/compute-tiers.display'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { millicentsToUsd } from '@/lib/billing-units'

interface Props {
  tier: ComputeTier
  planTier: PlanTierId
  selected: boolean
  isFreeSandbox?: boolean
  onClick: () => void
  /** 'compact' = tight vertical card (create-project grid). 'wide' = roomy
   *  horizontal card with a two-column spec grid (Infrastructure page). */
  variant?: 'compact' | 'wide'
  /** When true the tier is not entitled — the card is greyed, non-clickable,
   *  shows a Lock in place of the price, and surfaces `lockedReason` on hover. */
  disabled?: boolean
  lockedReason?: string
}

// Each tier gets a vector glyph that escalates with capability — from a
// flask (experiment) up to a factory (industrial throughput) — mirroring the
// public pricing page's per-card artwork.
const TIER_ICON: Record<ComputeTierId, LucideIcon> = {
  nano: FlaskConical,
  micro: Hammer,
  small: Wrench,
  medium: Rocket,
  large: Factory,
}

// Subscription tiers, in ascending order, with their display labels. Each
// plan discounts the compute drain rate server-side, so the per-hour cost
// (from useComputeSizesQuery's prices_by_plan) differs by plan — surfaced
// on the wide infra card.
const PLAN_TIERS: PlanTierId[] = ['free', 'self-serve', 'scale']
const PLAN_LABELS: Record<PlanTierId, string> = {
  free: 'Free',
  'self-serve': 'Self Serve',
  scale: 'Scale',
}

const fmt = (n: number) => n.toLocaleString('en-US')

function specs(tier: ComputeTier) {
  return [
    { icon: Cpu, label: `${tier.vcpu} vCPU · ${tier.ram} RAM` },
    { icon: HardDrive, label: `${tier.ebsGb} GB disk · ${tier.s3Gb} GB object storage` },
    { icon: Network, label: `${tier.egressGb} GB egress / mo bundled` },
    { icon: Users, label: `${fmt(tier.includedMau)} MAU included` },
  ]
}

export function ComputeTierCard({
  tier,
  planTier,
  selected,
  isFreeSandbox,
  onClick,
  variant = 'compact',
  disabled,
  lockedReason,
}: Props) {
  // Price is server-computed (COGS/margin never reach the browser) — read it
  // off the live /compute-sizes row matching this tier. `sizeRow` is
  // undefined until the query resolves or if the BE ever drops a tier the FE
  // still renders; either way `rateFor` degrades to "—" instead of crashing.
  const { data: org } = useSelectedOrganizationQuery()
  const { data: sizes } = useComputeSizesQuery(org?.slug)
  const sizeRow = sizes?.find((s) => s.id === tier.id)
  const rateFor = (plan: PlanTierId): number | null =>
    sizeRow ? millicentsToUsd(sizeRow.prices_by_plan[plan]) : null
  const rate = rateFor(planTier)
  const Icon = TIER_ICON[tier.id]

  const glyph = (
    <span
      className={cn(
        'flex items-center justify-center rounded-md shrink-0',
        variant === 'wide' ? 'h-11 w-11' : 'h-9 w-9',
        selected ? 'bg-brand text-background' : 'bg-brand-200 text-brand-600'
      )}
    >
      <Icon size={variant === 'wide' ? 22 : 18} strokeWidth={1.75} />
    </span>
  )

  const price = disabled ? (
    <div className="bg border rounded-lg h-7 w-7 flex items-center justify-center">
      <Lock size={14} />
    </div>
  ) : isFreeSandbox ? (
    <Badge variant="success">FREE</Badge>
  ) : (
    <div>
      <span className="text-base font-semibold text-foreground">
        {rate === null ? '—' : `$${rate.toFixed(4)}`}
      </span>
      <span className="text-xs text-foreground-light">/hr</span>
    </div>
  )

  // Per-subscription-tier hourly cost — shown on the wide infra card so the
  // operator sees what this compute size costs on every plan, not just theirs.
  // The current plan's row is emphasized.
  const pricePerPlan = (
    <div className="w-full max-w-[15rem] space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-foreground-lighter">
        Cost per plan
      </div>
      {PLAN_TIERS.map((p) => {
        const isCurrent = p === planTier
        const planRate = rateFor(p)
        return (
          <div
            key={p}
            className={cn(
              'flex items-baseline justify-between gap-4 rounded px-1.5 py-0.5',
              isCurrent && 'bg-brand-200/60'
            )}
          >
            <span className="text-xs text-foreground-light">
              {PLAN_LABELS[p]}
              {isCurrent && <span className="text-foreground-lighter"> · current</span>}
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {planRate === null ? '—' : `$${planRate.toFixed(4)}`}
              <span className="text-[11px] font-normal text-foreground-light">/hr</span>
            </span>
          </div>
        )
      })}
    </div>
  )

  // Wide cards (Infrastructure tab + project-creation picker) show the full
  // per-plan breakdown. Locked tiers STILL show it — the cost of each plan is
  // the upgrade value prop — with a small lock glyph by the title instead of a
  // lock in the price slot. Only a subsidy-enabled Sandbox keeps its FREE badge.
  const widePrice = isFreeSandbox ? price : pricePerPlan

  const selectedCheck = selected && !disabled && (
    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-background">
      <Check size={12} strokeWidth={3} />
    </span>
  )

  const baseClass = cn(
    'relative rounded-lg border text-left transition',
    selected && !disabled
      ? 'border-brand ring-1 ring-brand bg-brand-200/30'
      : 'border-default hover:border-foreground-muted',
    disabled && 'opacity-50'
  )

  const handleClick = disabled ? () => {} : onClick

  // --- Wide: icon + identity + price on the left, spec grid on the right ---
  const card =
    variant === 'wide' ? (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={selected}
        className={cn(baseClass, 'flex w-full flex-col gap-4 p-5 sm:flex-row sm:items-center')}
      >
        {selectedCheck}
        <div className="flex items-start gap-3 sm:w-72 sm:shrink-0">
          {glyph}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{tier.displayName}</span>
              {disabled && <Lock size={13} className="shrink-0 text-foreground-light" />}
            </div>
            <div className="text-xs text-foreground-light leading-snug">{tier.tagline}</div>
            <div className="pt-2">{widePrice}</div>
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 text-xs text-foreground-light sm:grid-cols-2">
          {specs(tier).map(({ icon: SpecIcon, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <SpecIcon size={14} className="text-foreground-lighter shrink-0" />
              <span>{label}</span>
            </div>
          ))}
        </dl>
      </button>
    ) : (
      // --- Compact: tight vertical card for the create-project grid ---
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={selected}
        className={cn(baseClass, 'flex h-full flex-col gap-3 p-4')}
      >
        {selectedCheck}
        <div className="flex flex-col gap-2">
          {glyph}
          <div>
            <div className="font-medium text-foreground">{tier.displayName}</div>
            <div className="text-xs text-foreground-light leading-snug">{tier.tagline}</div>
          </div>
        </div>
        <div className="text-sm">{price}</div>
        <dl className="mt-auto space-y-1.5 text-xs text-foreground-light">
          {specs(tier).map(({ icon: SpecIcon, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <SpecIcon size={13} className="text-foreground-lighter shrink-0" />
              <span>{label}</span>
            </div>
          ))}
        </dl>
      </button>
    )

  if (disabled && lockedReason) {
    return (
      <Tooltip>
        {/* Radix fires no pointer/focus events on a `disabled` <button>, so the
            tooltip would never open. Wrap it in a focusable, non-disabled span
            (mirrors DiskManagement/fields/ComputeSizeField) so the lock reason
            actually reaches the user on hover/focus. */}
        <TooltipTrigger asChild>
          <span tabIndex={0} className="block h-full w-full">
            {card}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="w-64 text-center">
          {lockedReason}
        </TooltipContent>
      </Tooltip>
    )
  }

  return card
}
