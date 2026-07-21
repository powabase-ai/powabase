import type { LedgerRow } from '@/data/credits/ledger-query'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { formatBillingAmount } from '@/lib/billing-units'
import { displayModelName } from '@/lib/model-display'

type ProjectsById = Record<string, { name: string; ref: string } | undefined>

export function ActivityTable({
  rows,
  projectsById,
  isAiOnUsEnabled,
}: {
  rows: LedgerRow[]
  projectsById: ProjectsById
  /**
   * Test/storybook override for the `billing:ai_on_us` gate. When omitted
   * (production), the gate reads from `useIsFeatureEnabled('billing:ai_on_us')`.
   * Matches the prop-override pattern established in Phase 11.1 (CostTooltip).
   */
  isAiOnUsEnabled?: boolean
}) {
  // `llm_call` rows are gated under `billing:ai_on_us`. When the flag is off
  // they are hidden entirely (BYOK-only deployments never see them); when on,
  // they render with the model display name in the Action column. Token
  // counts (prompt/completion) are deliberately NOT surfaced here — they
  // live in the agent trace / debug view, not the billing surface.
  const aiOnUsFromHook = useIsFeatureEnabled('billing:ai_on_us')
  const aiOnUsEnabled = isAiOnUsEnabled ?? aiOnUsFromHook
  const visibleRows = rows.filter((r) => r.action !== 'llm_call' || aiOnUsEnabled)

  if (visibleRows.length === 0) {
    return (
      <div className="text-center py-12 text-foreground-muted text-sm">
        No activity yet. Charges will appear here as you use the platform.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-default">
      <table className="w-full text-xs">
        <thead className="bg-surface-200 text-foreground-light">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Time</th>
            <th className="text-left px-3 py-2 font-medium">Action</th>
            <th className="text-left px-3 py-2 font-medium">Project</th>
            <th className="text-right px-3 py-2 font-medium">Qty</th>
            <th className="text-right px-3 py-2 font-medium">Unit</th>
            <th className="text-right px-3 py-2 font-medium">Credits</th>
            <th className="text-left px-3 py-2 font-medium">Ref ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {visibleRows.map((row) => {
            const ts = new Date(row.created_at)
            const relative = formatRelative(ts)
            const project = row.project_id ? projectsById[row.project_id] : undefined
            return (
              <tr key={row.id} className="hover:bg-surface-200">
                <td className="px-3 py-2 text-foreground-light" title={ts.toISOString()}>
                  {relative}
                </td>
                <td className="px-3 py-2 text-foreground">
                  {row.action === 'llm_call'
                    ? displayModelName(row.metadata?.model as string | undefined)
                    : row.action}
                </td>
                <td className="px-3 py-2 text-foreground-light">
                  {row.project_id
                    ? project
                      ? `${project.name} (${project.ref})`
                      : `${row.project_id.slice(0, 8)}…`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right text-foreground-light tabular-nums">
                  {row.quantity}
                </td>
                <td className="px-3 py-2 text-right text-foreground-light tabular-nums">
                  {formatBillingAmount(row.unit_credits)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums font-medium ${
                    row.credits < 0 ? 'text-[#fca5a5]' : 'text-[#86efac]'
                  }`}
                >
                  {formatBillingAmount(row.credits)}
                </td>
                <td className="px-3 py-2 text-foreground-muted">
                  <code title={row.ref_id ?? ''}>
                    {row.ref_id ? row.ref_id.slice(0, 16) : '—'}
                  </code>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatRelative(date: Date): string {
  // Math.max(0, ...) guards clock-skew "−5s ago"
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
