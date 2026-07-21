import Link from "next/link"
import { useMemo } from "react"

import {
  ErrorTable,
  StatCard,
  TimeSeriesBar,
  type ErrorRow,
  type SeriesDef,
} from "@/components/interfaces/Observability/charts"
import { useProjectAgentRunsQuery } from "@/data/observability/use-project-agent-runs-query"
import { useProjectTokensQuery } from "@/data/observability/use-project-tokens-query"
import { useProjectHealthQuery } from "@/data/observability/use-project-health-query"
import { useTableEditorRowLink } from "@/hooks/ai/useTableEditorRowLink"
import type { TokenFilters } from "@/data/observability/types"

// Compact observability panel for the Project Overview page. Shows the
// same data as /observability but trimmed: one health strip, one agent-
// runs chart, one tokens-by-model chart, and a link to the full page.
//
// Uses a fixed 24h range — the overview page is a dashboard, not a
// drill-down; for range control users go to the full observability page.

const RANGE = "24h" as const
const OVERVIEW_FILTERS: TokenFilters = { models: [], agents: [], source: "all" }

// Canonical Tailwind hex — names like `red`/`amber` are Radix-remapped in
// this repo's tailwind config. See memory/project_tailwind_radix_remap.md.
const AGENT_RUN_SERIES: SeriesDef[] = [
  { key: "completed", label: "Completed", color: "#34d399" },
  { key: "failed", label: "Failed", color: "#f87171" },
  { key: "running", label: "Running", color: "#60a5fa" },
]

const TOKEN_COLORS = ["#c4b5fd", "#60a5fa", "#34d399", "#fbbf24", "#fb923c", "#f472b6"]

interface OverviewStatsProps {
  projectRef: string
}

export function OverviewStats({ projectRef }: OverviewStatsProps) {
  const health = useProjectHealthQuery(RANGE)
  const runs = useProjectAgentRunsQuery(RANGE, { refetchIntervalMs: 60_000 })
  const tokens = useProjectTokensQuery(
    { range: RANGE, filters: OVERVIEW_FILTERS, groupBy: "model" },
    { refetchIntervalMs: 60_000 },
  )

  const tokenSeries = useMemo<SeriesDef[]>(
    () =>
      (tokens.data?.groupKeys ?? []).map((k, i) => {
        const label = tokens.data?.topGroups.find((g) => g.key === k)?.label ?? k
        return { key: k, label, color: TOKEN_COLORS[i % TOKEN_COLORS.length] }
      }),
    [tokens.data?.groupKeys, tokens.data?.topGroups],
  )

  // Resolve a deep-link from agent_runs.id → its row in the Table Editor
  // so users can click the ID column to inspect the full row in-place.
  const { buildHref: agentRunHref } = useTableEditorRowLink({
    schema: "ai",
    tableName: "agent_runs",
  })

  const failureRows: ErrorRow[] = useMemo(
    () =>
      (runs.data?.recentFailures ?? []).slice(0, 5).map((r) => ({
        id: r.id,
        when: r.created_at,
        kind: "Agent run",
        // Prefer the actual error text; the bare status "failed" has no
        // triage value. See use-project-agent-runs-query.ts for the SELECT.
        message: r.error || r.status || "",
        rowHref: agentRunHref(r.id) ?? undefined,
      })),
    [runs.data?.recentFailures, agentRunHref],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Observability (last 24h)</h2>
        <Link
          href={`/project/${projectRef}/observability`}
          className="text-xs text-brand hover:text-brand-600"
        >
          View full dashboard →
        </Link>
      </div>

      {/* Health strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Active runs"
          value={health.data?.activeRuns}
          tone="neutral"
          isLoading={health.isLoading}
        />
        <StatCard
          label="Failed runs (24h)"
          value={health.data?.failedRuns24h}
          tone={health.data && health.data.failedRuns24h > 0 ? "danger" : "ok"}
          isLoading={health.isLoading}
        />
        <StatCard
          label="Stuck extractions"
          value={health.data?.stuckExtractions}
          tone={health.data && health.data.stuckExtractions > 0 ? "warn" : "ok"}
          hint="> 10 min"
          isLoading={health.isLoading}
        />
        <StatCard
          label="Failed indexings"
          value={health.data?.failedIndexedSources}
          tone={health.data && health.data.failedIndexedSources > 0 ? "danger" : "ok"}
          isLoading={health.isLoading}
        />
        <StatCard
          label="Stuck workflows"
          value={health.data?.runningWorkflows}
          tone={health.data && health.data.runningWorkflows > 0 ? "warn" : "ok"}
          hint="> 5 min"
          isLoading={health.isLoading}
        />
      </div>

      {/* Agent runs + Cost side-by-side on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Agent runs</h3>
            <span className="text-xs text-foreground-muted">
              {runs.data?.total ?? 0} in range
            </span>
          </div>
          <TimeSeriesBar
            data={runs.data?.buckets ?? []}
            series={AGENT_RUN_SERIES}
            height={180}
            emptyMessage={runs.isLoading ? "Loading…" : "No agent runs in the last 24h"}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Tokens by model</h3>
            <span className="text-xs text-foreground-muted">
              {(tokens.data?.totals.totalTokens ?? 0).toLocaleString()} tokens
            </span>
          </div>
          <TimeSeriesBar
            data={tokens.data?.buckets ?? []}
            series={tokenSeries}
            height={180}
            emptyMessage={tokens.isLoading ? "Loading…" : "No token usage in the last 24h"}
          />
        </div>
      </div>

      {/* Recent failed runs — only shown when there's at least one */}
      {failureRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Recent failures</h3>
          <ErrorTable rows={failureRows} />
        </div>
      )}
    </div>
  )
}
