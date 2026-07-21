import { InfoTooltip } from "@/components/interfaces/AI/Shared/InfoTooltip"
import {
  TOKEN_PROVIDER_COVERAGE,
  TOKEN_TRACKING_CAVEATS,
  isReasoningModel,
} from "@/data/observability/token-tracking-info"

// Shared (i) tooltip explaining where the dashboard's token numbers come
// from and which providers don't fully populate the reasoning / cached
// buckets. Used both on the observability page header and inline next to
// the per-run usage card.

export function TokenTrackingInfoTooltip({ className }: { className?: string }) {
  return (
    <InfoTooltip title="How token counting works" className={className}>
      <p>{TOKEN_TRACKING_CAVEATS.what}</p>
      <ul className="space-y-2 list-none pl-0">
        {TOKEN_TRACKING_CAVEATS.buckets.map((b) => (
          <li key={b.label}>
            <span className="text-foreground font-medium">{b.label}</span>{" "}
            <span className="text-foreground-muted">— {b.desc}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-default pt-3">
        <p className="text-foreground font-medium mb-2">Provider coverage</p>
        <p className="text-xs text-foreground-muted mb-2">
          The platform routes through LiteLLM, which normalizes most providers'
          usage objects into the same shape. Coverage of the reasoning and
          cached fields varies:
        </p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-foreground-muted">
              <th className="py-1 pr-3">Provider</th>
              <th className="py-1 pr-3">Reasoning</th>
              <th className="py-1">Cached</th>
            </tr>
          </thead>
          <tbody>
            {TOKEN_PROVIDER_COVERAGE.map((row) => (
              <tr key={row.provider} className="border-t border-default align-top">
                <td className="py-1 pr-3 text-foreground">{row.provider}</td>
                <td className="py-1 pr-3 text-foreground">
                  <CoverageDot value={row.reasoning} />
                </td>
                <td className="py-1 text-foreground">
                  <CoverageDot value={row.cached} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-default pt-3 space-y-2 text-xs text-foreground-muted">
        {TOKEN_TRACKING_CAVEATS.caveats.map((c) => (
          <p key={c}>• {c}</p>
        ))}
      </div>
    </InfoTooltip>
  )
}

function CoverageDot({ value }: { value: "yes" | "partial" | "no" }) {
  const map = {
    yes: { label: "Reported", color: "#34d399" },
    partial: { label: "Varies", color: "#fbbf24" },
    no: { label: "Not reported", color: "#a1a1aa" },
  } as const
  const v = map[value]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: v.color }}
      />
      <span>{v.label}</span>
    </span>
  )
}

interface ReasoningModelZeroAlertProps {
  /** Model string from the run (e.g., "gpt-5-mini"). */
  model: string | null | undefined
  /** Reasoning tokens reported for this run / aggregation. */
  reasoningTokens: number | null | undefined
  /** Compact rendering for inline-in-card use. */
  compact?: boolean
}

/** Inline alert that fires only when the model looks reasoning-capable but
 *  the run shows 0 reasoning tokens. Explains the most common causes so
 *  users don't read this as a dashboard bug. */
export function ReasoningModelZeroAlert({
  model,
  reasoningTokens,
  compact,
}: ReasoningModelZeroAlertProps) {
  if (!isReasoningModel(model)) return null
  if ((reasoningTokens ?? 0) > 0) return null

  return (
    <div
      className={
        compact
          ? "mt-2 p-2 rounded-md border border-default bg-surface-200 text-[11px] text-foreground-muted"
          : "mt-2 p-3 rounded-md border border-[#fbbf24]/40 bg-[#fbbf24]/10 text-xs text-foreground-light"
      }
      role="note"
    >
      <p className="text-foreground">
        <strong>{model}</strong> is a reasoning-capable model but this run
        reports 0 reasoning tokens. Common causes:
      </p>
      <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
        <li>
          The provider didn't surface a reasoning breakdown for this call (some
          Bedrock / Vertex passthroughs report only top-level tokens).
        </li>
        <li>
          Reasoning was disabled at call time (e.g., reasoning-effort flag set
          to <code className="font-mono">"none"</code>, or extended thinking
          turned off on Anthropic).
        </li>
        <li>
          The query was simple enough that the model didn't allocate any
          reasoning budget.
        </li>
        <li>
          A streaming response was aborted before the final usage chunk
          arrived.
        </li>
      </ul>
    </div>
  )
}
