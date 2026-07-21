import { useMemo, useState } from "react"

import DefaultLayout from "@/components/layouts/DefaultLayout"
import AILayout from "@/components/layouts/AILayout/AILayout"
import type { NextPageWithLayout } from "@/types"

import {
  ErrorTable,
  StatCard,
  StatusDonut,
  TimeSeriesBar,
  type ErrorRow,
  type SeriesDef,
} from "@/components/interfaces/Observability/charts"
import { useProjectHealthQuery } from "@/data/observability/use-project-health-query"
import { useProjectAgentRunsQuery } from "@/data/observability/use-project-agent-runs-query"
import { useProjectExtractionQuery } from "@/data/observability/use-project-extraction-query"
import { useProjectTokensQuery } from "@/data/observability/use-project-tokens-query"
import { useProjectToolCallsQuery } from "@/data/observability/use-project-tool-calls-query"
import { useProjectFilterOptionsQuery } from "@/data/observability/use-project-filter-options-query"
import { TokenTrackingInfoTooltip } from "@/components/interfaces/Observability/TokenTrackingInfo"
import { useTableEditorRowLink } from "@/hooks/ai/useTableEditorRowLink"
import type {
  ObservabilityRange,
  TimeBucketSize,
  TokenDateRange,
  TokenFilters,
  TokenGroupBy,
  TokenSourceType,
} from "@/data/observability/types"

const RANGE_OPTIONS: { label: string; value: ObservabilityRange }[] = [
  { label: "Last hour", value: "1h" },
  { label: "Last 24h", value: "24h" },
  { label: "Last 7d", value: "7d" },
  { label: "Last 30d", value: "30d" },
  { label: "Last 90d", value: "90d" },
  { label: "Custom range", value: "custom" },
]

const BUCKET_OPTIONS: { label: string; value: TimeBucketSize }[] = [
  { label: "Auto", value: "auto" },
  { label: "Per minute", value: "minute" },
  { label: "Per hour", value: "hour" },
  { label: "Per day", value: "day" },
  { label: "Per week", value: "week" },
]

/** Render an ISO timestamp as the local-tz value an <input type="datetime-local"> expects. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Inverse of isoToLocalInput: parse the input value as local time → ISO. */
function localInputToIso(s: string): string {
  // Date constructor parses "YYYY-MM-DDTHH:mm" as local time when no offset.
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

const GROUP_BY_OPTIONS: { label: string; value: TokenGroupBy }[] = [
  { label: "By model", value: "model" },
  { label: "By agent", value: "agent" },
  { label: "By source", value: "type" },
]

const SOURCE_OPTIONS: { label: string; value: TokenSourceType }[] = [
  { label: "All sources", value: "all" },
  { label: "Agent runs", value: "agent_runs" },
  { label: "Orchestrations", value: "orchestration_runs" },
  { label: "Workflow blocks", value: "workflow_block_logs" },
]

const AGENT_RUN_SERIES: SeriesDef[] = [
  { key: "completed", label: "Completed", color: "#34d399" },
  { key: "failed", label: "Failed", color: "#f87171" },
  { key: "running", label: "Running", color: "#60a5fa" },
  {
    key: "p95DurationSec",
    label: "p95 duration (s)",
    color: "#c4b5fd",
    kind: "line",
    yAxisId: "right",
  },
]

const EXTRACTION_STATUS_COLORS: Record<string, string> = {
  pending: "#fbbf24",
  extracting: "#60a5fa",
  extracted: "#34d399",
  attention_required: "#fb923c",
  failed: "#f87171",
  cancelled: "#a1a1aa",
}

const INDEXING_STATUS_COLORS: Record<string, string> = {
  pending: "#fbbf24",
  indexing: "#60a5fa",
  indexed: "#34d399",
  failed: "#f87171",
  cancelled: "#a1a1aa",
}

const PALETTE = ["#c4b5fd", "#60a5fa", "#34d399", "#fbbf24", "#fb923c", "#f472b6", "#2dd4bf"]

interface MultiSelectProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const displayLabel =
    selected.length === 0
      ? `All ${label.toLowerCase()}`
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} ${label.toLowerCase()}`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2 py-1 rounded-md border border-default bg-surface-200 text-foreground min-w-[140px] text-left"
      >
        {label}: <span className="text-foreground-muted">{displayLabel}</span>
      </button>
      {open && (
        <div
          className="absolute z-10 mt-1 w-60 max-h-64 overflow-y-auto rounded-md border border-default bg-surface-100 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="p-1">
            <button
              type="button"
              className="w-full text-left px-2 py-1 text-xs text-foreground-muted hover:bg-surface-200 rounded"
              onClick={() => onChange([])}
            >
              Clear selection
            </button>
            {options.length === 0 ? (
              <div className="px-2 py-2 text-xs text-foreground-muted">No options</div>
            ) : (
              options.map((o) => {
                const checked = selected.includes(o.value)
                return (
                  <label
                    key={o.value}
                    className="flex items-center gap-2 px-2 py-1 text-xs text-foreground hover:bg-surface-200 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange(
                          checked ? selected.filter((s) => s !== o.value) : [...selected, o.value],
                        )
                      }
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const ObservabilityPage: NextPageWithLayout = () => {
  const [range, setRange] = useState<ObservabilityRange>("24h")
  const [groupBy, setGroupBy] = useState<TokenGroupBy>("model")
  const [bucketSize, setBucketSize] = useState<TimeBucketSize>("auto")
  const [filters, setFilters] = useState<TokenFilters>({
    models: [],
    agents: [],
    source: "all",
  })
  // Default custom range = trailing 7d (only consulted when range === "custom").
  const [customRange, setCustomRange] = useState<TokenDateRange>(() => {
    const to = new Date()
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
    return { from: from.toISOString(), to: to.toISOString() }
  })

  // Existing health/agent-runs/extraction queries don't yet take a custom
  // date range — fall back to 30d when the user picks "custom" so the
  // helper strips at the bottom still render. (Tokens/tool-calls panels
  // honor the full filter bar; the helper strips are scoped looser.)
  const presetRangeForLegacy: ObservabilityRange = range === "custom" ? "30d" : range
  const health = useProjectHealthQuery(presetRangeForLegacy)
  const runs = useProjectAgentRunsQuery(presetRangeForLegacy)
  const extraction = useProjectExtractionQuery(presetRangeForLegacy)
  const filterOptions = useProjectFilterOptionsQuery()
  const tokens = useProjectTokensQuery({ range, filters, groupBy, bucketSize, customRange })
  const toolCalls = useProjectToolCallsQuery({ range, filters, customRange })

  const tokenSeries = useMemo<SeriesDef[]>(
    () =>
      (tokens.data?.groupKeys ?? []).map((k, i) => {
        const label = tokens.data?.topGroups.find((g) => g.key === k)?.label ?? k
        return { key: k, label, color: PALETTE[i % PALETTE.length] }
      }),
    [tokens.data?.groupKeys, tokens.data?.topGroups],
  )

  // Pick an X-axis tick format that matches the resolved bucket size.
  // dayjs format strings; week/day buckets show no time, hour shows HH:00,
  // minute shows HH:mm.
  const tokensXAxisFormat = useMemo(() => {
    switch (tokens.data?.resolvedBucket) {
      case "minute":
        return "HH:mm"
      case "hour":
        return "MMM D HH:00"
      case "week":
      case "day":
        return "MMM D"
      default:
        return "MMM D HH:mm"
    }
  }, [tokens.data?.resolvedBucket])

  const toolCallSeries = useMemo<SeriesDef[]>(
    () => [
      { key: "calls", label: "Calls", color: "#60a5fa" },
      { key: "errors", label: "Errors", color: "#f87171" },
    ],
    [],
  )

  const toolCallBuckets = useMemo(
    () =>
      (toolCalls.data?.rollups ?? []).slice(0, 10).map((r) => ({
        bucket: r.tool,
        calls: r.calls,
        errors: r.errors,
      })),
    [toolCalls.data?.rollups],
  )

  const toolCallDurationBuckets = useMemo(
    () =>
      (toolCalls.data?.rollups ?? []).slice(0, 10).map((r) => ({
        bucket: r.tool,
        p95DurationMs: r.p95DurationMs,
      })),
    [toolCalls.data?.rollups],
  )

  const { buildHref: agentRunHref } = useTableEditorRowLink({
    schema: "ai",
    tableName: "agent_runs",
  })

  const failureRows: ErrorRow[] = useMemo(
    () =>
      (runs.data?.recentFailures ?? []).map((r) => ({
        id: r.id,
        when: r.created_at,
        kind: "Agent run",
        // Prefer the actual error text; fall back to status only when the
        // backend didn't capture an error message. The literal "failed"
        // alone is useless for triage.
        message: r.error || r.status || "",
        rowHref: agentRunHref(r.id) ?? undefined,
      })),
    [runs.data?.recentFailures, agentRunHref],
  )

  const activeFiltersLabel =
    filters.models.length + filters.agents.length === 0 && filters.source === "all"
      ? null
      : [
          filters.source !== "all" ? filters.source.replace("_", " ") : null,
          filters.models.length > 0 ? `${filters.models.length} model(s)` : null,
          filters.agents.length > 0 ? `${filters.agents.length} agent(s)` : null,
        ]
          .filter(Boolean)
          .join(" · ")

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Observability</h1>
          <p className="text-sm text-foreground-light mt-1">
            Token usage, tool calls, and run health for this project.
          </p>
        </div>

        {/* Filter bar */}
        <section className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-background/90 backdrop-blur border-b border-default">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Time range"
              className="text-xs px-2 py-1 rounded-md border border-default bg-surface-200 text-foreground"
              value={range}
              onChange={(e) => setRange(e.target.value as ObservabilityRange)}
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Source type"
              className="text-xs px-2 py-1 rounded-md border border-default bg-surface-200 text-foreground"
              value={filters.source}
              onChange={(e) =>
                setFilters((f) => ({ ...f, source: e.target.value as TokenSourceType }))
              }
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <MultiSelect
              label="Models"
              options={filterOptions.data?.models ?? []}
              selected={filters.models}
              onChange={(v) => setFilters((f) => ({ ...f, models: v }))}
            />
            <MultiSelect
              label="Agents"
              options={filterOptions.data?.agents ?? []}
              selected={filters.agents}
              onChange={(v) => setFilters((f) => ({ ...f, agents: v }))}
            />
            <select
              aria-label="Bucket size"
              title="X-axis bucket size"
              className="text-xs px-2 py-1 rounded-md border border-default bg-surface-200 text-foreground"
              value={bucketSize}
              onChange={(e) => setBucketSize(e.target.value as TimeBucketSize)}
            >
              {BUCKET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Bin: {o.label.toLowerCase()}
                </option>
              ))}
            </select>
            <select
              aria-label="Group by"
              className="text-xs px-2 py-1 rounded-md border border-default bg-surface-200 text-foreground ml-auto"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as TokenGroupBy)}
            >
              {GROUP_BY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {range === "custom" && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <label className="text-[11px] text-foreground-muted">From</label>
              <input
                type="datetime-local"
                className="text-xs px-2 py-1 rounded-md border border-default bg-surface-200 text-foreground"
                value={isoToLocalInput(customRange.from)}
                onChange={(e) =>
                  setCustomRange((cr) => ({ ...cr, from: localInputToIso(e.target.value) }))
                }
              />
              <label className="text-[11px] text-foreground-muted">To</label>
              <input
                type="datetime-local"
                className="text-xs px-2 py-1 rounded-md border border-default bg-surface-200 text-foreground"
                value={isoToLocalInput(customRange.to)}
                onChange={(e) =>
                  setCustomRange((cr) => ({ ...cr, to: localInputToIso(e.target.value) }))
                }
              />
            </div>
          )}
          {activeFiltersLabel && (
            <div className="text-[11px] text-foreground-muted mt-2">{activeFiltersLabel}</div>
          )}
        </section>

        {/* Query error banner — surfaces 5xx / network failures from any of
            the six observability hooks. Without this a 500 from the proxy
            renders as "No data in range" on every chart with no signal that
            the failure happened. Mirrors the org/[slug]/usage.tsx pattern. */}
        {(() => {
          const failed: Array<{ label: string; err: unknown }> = []
          if (health.isError) failed.push({ label: "health", err: health.error })
          if (runs.isError) failed.push({ label: "agent runs", err: runs.error })
          if (extraction.isError)
            failed.push({ label: "extraction", err: extraction.error })
          if (tokens.isError) failed.push({ label: "tokens", err: tokens.error })
          if (toolCalls.isError)
            failed.push({ label: "tool calls", err: toolCalls.error })
          if (filterOptions.isError)
            failed.push({ label: "filter options", err: filterOptions.error })
          if (failed.length === 0) return null
          return (
            <div className="text-xs text-[#fca5a5] border border-[#7f1d1d]/40 bg-[#7f1d1d]/10 rounded-md px-3 py-2">
              Failed to load{" "}
              {failed.map((f, i) => (
                <span key={f.label}>
                  {i > 0 && (i === failed.length - 1 ? " and " : ", ")}
                  <span className="font-medium">{f.label}</span>
                </span>
              ))}
              :{" "}
              {failed[0].err instanceof Error
                ? failed[0].err.message
                : "unknown error"}
            </div>
          )
        })()}

        {/* Token-query overflow banner — fires when any source query hit
            the 50k row cap. Below that the chart drops the busiest end of
            the window without any signal. Long-term, swap to a Postgres RPC. */}
        {tokens.data?.truncatedSources && tokens.data.truncatedSources.length > 0 && (
          <div className="text-xs text-[#fbbf24] border border-[#92400e]/40 bg-[#92400e]/10 rounded-md px-3 py-2">
            Token chart truncated: more than 50,000 rows in range from{" "}
            <span className="font-medium">
              {tokens.data.truncatedSources.join(", ")}
            </span>
            . Recent activity may be over-represented; older windows
            under-represented. Narrow the time range or filter by model/agent
            to see complete data.
          </div>
        )}

        {/* Totals strip */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">Token totals</h2>
            <TokenTrackingInfoTooltip />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Input tokens"
              value={tokens.data?.totals.promptTokens}
              tone="neutral"
              isLoading={tokens.isLoading}
            />
            <StatCard
              label="Output tokens"
              value={Math.max(
                0,
                (tokens.data?.totals.completionTokens ?? 0) -
                  (tokens.data?.totals.reasoningTokens ?? 0),
              )}
              tone="neutral"
              hint="visible (excl. reasoning)"
              isLoading={tokens.isLoading}
            />
            <StatCard
              label="Reasoning tokens"
              value={tokens.data?.totals.reasoningTokens}
              tone="neutral"
              isLoading={tokens.isLoading}
            />
            <StatCard
              label="Run count"
              value={tokens.data?.totals.runCount}
              tone="neutral"
              isLoading={tokens.isLoading}
            />
          </div>
        </section>

        {/* Tokens chart */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Tokens ({GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? groupBy})
            </h2>
            <span className="text-xs text-foreground-muted">
              {(tokens.data?.totals.totalTokens ?? 0).toLocaleString()} total
            </span>
          </div>
          <TimeSeriesBar
            data={tokens.data?.buckets ?? []}
            series={tokenSeries}
            xAxisFormat={tokensXAxisFormat}
            emptyMessage={tokens.isLoading ? "Loading…" : "No token usage in range"}
          />
        </section>

        {/* Top-N table */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Top {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label.toLowerCase() ?? groupBy}
          </h2>
          <div className="rounded-md border border-default overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-200 text-foreground-muted">
                <tr>
                  <th className="text-left px-3 py-2">Dimension</th>
                  <th className="text-right px-3 py-2">Total tokens</th>
                  <th className="text-right px-3 py-2">Runs</th>
                  <th className="text-right px-3 py-2">% tokens</th>
                  <th className="text-right px-3 py-2">Fail %</th>
                  <th className="text-right px-3 py-2">Tokens/run</th>
                </tr>
              </thead>
              <tbody>
                {(tokens.data?.topGroups ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-foreground-muted">
                      {tokens.isLoading ? "Loading…" : "No data in range"}
                    </td>
                  </tr>
                ) : (
                  (tokens.data?.topGroups ?? []).map((g) => {
                    const total = tokens.data?.totals.totalTokens ?? 0
                    const pct = total > 0 ? Math.round((g.totalTokens / total) * 100) : 0
                    const failPct =
                      g.runCount > 0 ? Math.round((g.failedCount / g.runCount) * 100) : 0
                    const perRun = g.runCount > 0 ? Math.round(g.totalTokens / g.runCount) : 0
                    return (
                      <tr key={g.key} className="border-t border-default">
                        <td className="px-3 py-2 text-foreground truncate max-w-xs">{g.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {g.totalTokens.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{g.runCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{failPct}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {perRun.toLocaleString()}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tool-call metrics */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Tool calls</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Total calls"
              value={toolCalls.data?.totals.calls}
              tone="neutral"
              isLoading={toolCalls.isLoading}
            />
            <StatCard
              label="Errors"
              value={toolCalls.data?.totals.errors}
              tone={(toolCalls.data?.totals.errors ?? 0) > 0 ? "danger" : "ok"}
              isLoading={toolCalls.isLoading}
            />
            <StatCard
              label="Avg duration"
              value={toolCalls.data?.totals.avgDurationMs}
              hint="ms"
              tone="neutral"
              isLoading={toolCalls.isLoading}
            />
            <StatCard
              label="Unique tools"
              value={toolCalls.data?.totals.uniqueTools}
              tone="neutral"
              isLoading={toolCalls.isLoading}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
                Calls by tool (top 10)
              </p>
              <TimeSeriesBar
                data={toolCallBuckets}
                series={toolCallSeries}
                emptyMessage={toolCalls.isLoading ? "Loading…" : "No tool calls in range"}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
                p95 duration by tool (ms)
              </p>
              <TimeSeriesBar
                data={toolCallDurationBuckets}
                series={[{ key: "p95DurationMs", label: "p95 duration (ms)", color: "#c4b5fd" }]}
                emptyMessage={toolCalls.isLoading ? "Loading…" : "No tool calls in range"}
              />
            </div>
          </div>
        </section>

        {/* Health strip */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Project health</h2>
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
              hint="> 10 min in extracting"
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
              hint="> 5 min running"
              isLoading={health.isLoading}
            />
          </div>
        </section>

        {/* Agent runs breakdown */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Agent runs</h2>
            <span className="text-xs text-foreground-muted">
              {runs.data?.total ?? 0} runs in range
            </span>
          </div>
          <TimeSeriesBar
            data={runs.data?.buckets ?? []}
            series={AGENT_RUN_SERIES}
            rightAxisLabel="seconds"
            emptyMessage={runs.isLoading ? "Loading…" : "No agent runs in range"}
          />
          <div>
            <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider mt-3 mb-2">
              Recent failed runs
            </p>
            <ErrorTable
              rows={failureRows}
              emptyMessage={runs.isLoading ? "Loading…" : "No failed runs in range"}
            />
          </div>
        </section>

        {/* Extraction / indexing */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Source extraction</h2>
            <StatusDonut
              data={extraction.data?.extractionCounts ?? []}
              colors={EXTRACTION_STATUS_COLORS}
              emptyMessage={extraction.isLoading ? "Loading…" : "No sources yet"}
            />
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Knowledge indexing</h2>
            <StatusDonut
              data={extraction.data?.indexingCounts ?? []}
              colors={INDEXING_STATUS_COLORS}
              emptyMessage={extraction.isLoading ? "Loading…" : "No indexed sources yet"}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

ObservabilityPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Observability">{page}</AILayout>
  </DefaultLayout>
)

export default ObservabilityPage
