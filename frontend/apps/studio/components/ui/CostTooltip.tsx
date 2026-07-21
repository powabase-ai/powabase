import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { formatBillingAmount } from '@/lib/billing-units'

export type CostModel = 'fixed' | 'llm_passthrough'

export interface CostTooltipProps {
  action: string
  unitCredits: number
  unitLabel: string
  costModel: CostModel
  /**
   * Test/storybook override for the `billing:ai_on_us` gate. When omitted
   * (production), the gate reads from `useIsFeatureEnabled('billing:ai_on_us')`.
   * Only the `llm_passthrough` branch consults this flag.
   */
  isAiOnUsEnabled?: boolean
}

/**
 * Inline cost label for a chargeable action. Renders a small visible
 * `$X.XX per <unit>` (or `Free`) so users see the price next to the action
 * without needing to hover.
 *
 * Presentational only — the caller owns the pricing-row lookup and passes
 * the four columns through. The `credits:enabled` feature gate
 * (which decides whether to show the label at all) lives at the call site.
 *
 * Branches by `costModel`:
 * - `'fixed'`: `Free` when `unitCredits === 0`, else `$X.XX per <unitLabel>`.
 * - `'llm_passthrough'`: gated under `billing:ai_on_us`. When the flag is off
 *   the row is hidden entirely; when on, renders a variable-rate explanation.
 */
export function CostTooltip({
  action,
  unitCredits,
  unitLabel,
  costModel,
  isAiOnUsEnabled,
}: CostTooltipProps) {
  const aiOnUsFromHook = useIsFeatureEnabled('billing:ai_on_us')
  if (costModel === 'fixed') {
    const label =
      unitCredits === 0 ? 'Free' : `${formatBillingAmount(unitCredits)} per ${unitLabel}`
    return (
      <span
        className="text-xs text-foreground-muted tabular-nums"
        aria-label={`Cost for ${action}: ${label}`}
      >
        {label}
      </span>
    )
  }

  // llm_passthrough: AI-on-us pass-through cost. Gated under
  // `billing:ai_on_us` so the row is invisible to BYOK-only deployments
  // until the operator flips the flag at rollout.
  const aiOnUsEnabled = isAiOnUsEnabled ?? aiOnUsFromHook
  if (!aiOnUsEnabled) return null
  const label =
    "Variable — charged at ~25% over your LLM provider's rate per call. " +
    'Your activity log shows the exact amount. BYOK projects: $0.'
  return (
    <span
      className="text-xs text-foreground-muted"
      aria-label={`Cost for ${action}: ${label}`}
    >
      {label}
    </span>
  )
}
