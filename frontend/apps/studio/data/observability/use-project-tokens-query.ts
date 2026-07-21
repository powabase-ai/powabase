import { useQuery } from "@tanstack/react-query"

import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient"
import { hasAiAuth } from "@/lib/ai-api"
import { observabilityApi } from "@/lib/ai-api/observability-api"
import { observabilityKeys } from "./keys"
import type {
  ObservabilityRange,
  ProjectTokensData,
  TimeBucket,
  TimeBucketSize,
  TokenDateRange,
  TokenFilters,
  TokenGroupBy,
  TokenGroupTotals,
} from "./types"

// Reads typed token columns from ai.agent_runs (+ optionally
// ai.orchestration_runs, ai.workflow_block_logs) via PostgREST and
// aggregates in JS. 50k row cap is plenty for months of runs on a single
// project; if we outgrow it, swap to a Postgres RPC without changing the
// page. See migration 0019 for the schema these queries rely on.
//
// When any source query returns exactly 50k rows we treat it as
// truncation and surface the source name in `truncatedSources` so the
// page can render an overflow banner — silently dropping rows would
// misrepresent the busiest windows on the chart.

const TOKEN_QUERY_ROW_CAP = 50_000

type TokenSource = "agent_runs" | "orchestration_runs" | "workflow_block_logs"

const RANGE_MS: Record<Exclude<ObservabilityRange, "custom">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
}

/** Resolve "auto" binning based on the active time-window length. */
function resolveBucketSize(
  bucketSize: TimeBucketSize,
  windowMs: number,
): Exclude<TimeBucketSize, "auto"> {
  if (bucketSize !== "auto") return bucketSize
  if (windowMs <= 60 * 60 * 1000) return "minute"
  if (windowMs <= 48 * 60 * 60 * 1000) return "hour"
  if (windowMs <= 60 * 24 * 60 * 60 * 1000) return "day"
  return "week"
}

/** Truncate an ISO timestamp to the chosen bucket size. */
function bucketFor(iso: string, bucket: Exclude<TimeBucketSize, "auto">): string {
  const d = new Date(iso)
  switch (bucket) {
    case "minute":
      d.setUTCSeconds(0, 0)
      break
    case "hour":
      d.setUTCMinutes(0, 0, 0)
      break
    case "day":
      d.setUTCHours(0, 0, 0, 0)
      break
    case "week": {
      d.setUTCHours(0, 0, 0, 0)
      // ISO week start = Monday; getUTCDay returns 0=Sun..6=Sat
      const dow = d.getUTCDay()
      const diff = (dow + 6) % 7
      d.setUTCDate(d.getUTCDate() - diff)
      break
    }
  }
  return d.toISOString()
}

/** Resolve the [since, until] window from range + optional custom bounds. */
function resolveWindow(
  range: ObservabilityRange,
  custom: TokenDateRange | undefined,
): { since: string; until: string; windowMs: number } {
  if (range === "custom" && custom) {
    const since = new Date(custom.from)
    const until = new Date(custom.to)
    return {
      since: since.toISOString(),
      until: until.toISOString(),
      windowMs: Math.max(0, until.getTime() - since.getTime()),
    }
  }
  const ms = RANGE_MS[range as Exclude<ObservabilityRange, "custom">]
  const until = new Date()
  const since = new Date(until.getTime() - ms)
  return { since: since.toISOString(), until: until.toISOString(), windowMs: ms }
}

interface AgentRunRow {
  id: string
  created_at: string | null
  status: string | null
  model: string | null
  agent_id: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  reasoning_tokens: number | null
  total_tokens: number | null
  source?: "agent_runs" | "orchestration_runs" | "workflow_block_logs"
  block_type?: string | null
}

interface AgentLookupRow {
  id: string
  name: string | null
}

interface ProjectTokensQueryArgs {
  range: ObservabilityRange
  filters: TokenFilters
  groupBy: TokenGroupBy
  /** "auto" picks the bucket size based on range length. Default: "auto". */
  bucketSize?: TimeBucketSize
  /** Required when range === "custom"; ignored otherwise. */
  customRange?: TokenDateRange
}

export function useProjectTokensQuery(
  { range, filters, groupBy, bucketSize = "auto", customRange }: ProjectTokensQueryArgs,
  { enabled = true, refetchIntervalMs = 60_000 }: { enabled?: boolean; refetchIntervalMs?: number } = {},
) {
  const { token, ref, isReady } = useProjectSupabaseClient()
  const filtersKey = JSON.stringify({
    m: [...filters.models].sort(),
    a: [...filters.agents].sort(),
    s: filters.source,
    b: bucketSize,
    cr: range === "custom" ? customRange : null,
  })

  return useQuery<ProjectTokensData>({
    queryKey: observabilityKeys.projectTokens(ref, range, filtersKey, groupBy),
    enabled: enabled && isReady && hasAiAuth(token),
    refetchInterval: refetchIntervalMs,
    queryFn: async () => {
      if (!hasAiAuth(token)) throw new Error("Project client not ready")
      const { since, until, windowMs } = resolveWindow(range, customRange)
      const resolvedBucket = resolveBucketSize(bucketSize, windowMs)

      const rows: AgentRunRow[] = []
      const truncatedSources: TokenSource[] = []

      // Orchestration and workflow_block rows don't carry agent_id, so when
      // the user is filtering by agent we scope to agent_runs only — including
      // the other sources would mix in unfiltered noise that's not "their agent".
      const agentFilterActive = filters.agents.length > 0
      const needAgentRuns = filters.source === "agent_runs" || filters.source === "all"
      const needOrchRuns =
        !agentFilterActive &&
        (filters.source === "orchestration_runs" || filters.source === "all")
      const needBlockLogs =
        !agentFilterActive &&
        (filters.source === "workflow_block_logs" || filters.source === "all")

      if (needAgentRuns) {
        const res = await observabilityApi.listAgentRuns(token, ref, {
          since,
          until,
          models: filters.models,
          agentIds: filters.agents,
          limit: TOKEN_QUERY_ROW_CAP,
        })
        const fetched = res.runs as AgentRunRow[]
        if (res.truncated) truncatedSources.push("agent_runs")
        for (const r of fetched) {
          rows.push({ ...r, source: "agent_runs" })
        }
      }

      if (needOrchRuns) {
        const res = await observabilityApi.listOrchestrationRuns(token, ref, {
          since,
          until,
          models: filters.models,
          limit: TOKEN_QUERY_ROW_CAP,
        })
        const fetched = res.runs as AgentRunRow[]
        if (res.truncated) truncatedSources.push("orchestration_runs")
        for (const r of fetched) {
          rows.push({ ...r, source: "orchestration_runs", agent_id: null })
        }
      }

      if (needBlockLogs) {
        const res = await observabilityApi.listWorkflowBlockLogs(token, ref, {
          since,
          until,
          models: filters.models,
          limit: TOKEN_QUERY_ROW_CAP,
        })
        const fetched = res.logs as AgentRunRow[]
        if (res.truncated) truncatedSources.push("workflow_block_logs")
        for (const r of fetched) {
          rows.push({ ...r, source: "workflow_block_logs", agent_id: null })
        }
      }

      // Resolve agent id → name for the "agent" groupBy dimension.
      let agentNames = new Map<string, string>()
      if (groupBy === "agent") {
        const ids = [...new Set(rows.map((r) => r.agent_id).filter((x): x is string => !!x))]
        if (ids.length > 0) {
          const res = await observabilityApi.getAgentsLookup(token, ref, ids)
          agentNames = new Map(
            (res.agents as AgentLookupRow[]).map((a) => [a.id, a.name ?? a.id]),
          )
        }
      }

      // Aggregate.
      const totals = {
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        runCount: 0,
      }
      const keyFor = (r: AgentRunRow): { key: string; label: string } => {
        switch (groupBy) {
          case "model": {
            const m = r.model || "unknown"
            return { key: m, label: m }
          }
          case "agent": {
            const id = r.agent_id || "unassigned"
            return { key: id, label: agentNames.get(id) ?? id }
          }
          case "type": {
            const s = r.source || "agent_runs"
            return { key: s, label: s }
          }
          case "day":
          case "tool": // "tool" belongs to the tool-calls chart; fall back to day.
            return { key: "day", label: "all" }
        }
      }

      // Per-row, per-bucket aggregation. Stash both the per-key totals (for
      // top-N) and the per-bucket-per-key totals (for the time series).
      const rawTotals = new Map<string, TokenGroupTotals>()
      const rawBuckets = new Map<string, Map<string, number>>()

      for (const r of rows) {
        const prompt = r.prompt_tokens ?? 0
        const completion = r.completion_tokens ?? 0
        const reasoning = r.reasoning_tokens ?? 0
        // OpenAI's contract: total = prompt + completion, with reasoning
        // already inside completion. Don't sum reasoning a second time.
        const total = r.total_tokens ?? prompt + completion
        totals.promptTokens += prompt
        totals.completionTokens += completion
        totals.reasoningTokens += reasoning
        totals.totalTokens += total
        totals.runCount += 1

        const { key, label } = keyFor(r)
        const existing = rawTotals.get(key) ?? {
          key,
          label,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          runCount: 0,
          failedCount: 0,
        }
        existing.promptTokens += prompt
        existing.completionTokens += completion
        existing.reasoningTokens += reasoning
        existing.totalTokens += total
        existing.runCount += 1
        if (r.status === "failed" || r.status === "error") existing.failedCount += 1
        rawTotals.set(key, existing)

        if (r.created_at) {
          const b = bucketFor(r.created_at, resolvedBucket)
          const inner = rawBuckets.get(b) ?? new Map<string, number>()
          inner.set(key, (inner.get(key) ?? 0) + total)
          rawBuckets.set(b, inner)
        }
      }

      // Top-N rollup: chart series and Top-N table both use these keys.
      // Keys outside the top 10 collapse into a single "other" series so
      // the chart legend stays readable when cardinality is high.
      const sortedTotals = [...rawTotals.values()].sort(
        (a, b) => b.totalTokens - a.totalTokens,
      )
      const TOP_N = 10
      const topGroups = sortedTotals.slice(0, TOP_N)
      const topKeys = new Set(topGroups.map((g) => g.key))
      const hasOther = sortedTotals.length > TOP_N
      const OTHER_KEY = "__other__"

      const groupKeys = [...topGroups.map((g) => g.key)]
      if (hasOther) groupKeys.push(OTHER_KEY)
      // Build "other" rollup row so the Top-N table can show it as a footer
      // when the caller wants. (Currently only the chart consumes it.)
      if (hasOther) {
        const other: TokenGroupTotals = {
          key: OTHER_KEY,
          label: `other (${sortedTotals.length - TOP_N})`,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          runCount: 0,
          failedCount: 0,
        }
        for (const g of sortedTotals.slice(TOP_N)) {
          other.promptTokens += g.promptTokens
          other.completionTokens += g.completionTokens
          other.reasoningTokens += g.reasoningTokens
          other.totalTokens += g.totalTokens
          other.runCount += g.runCount
          other.failedCount += g.failedCount
        }
        topGroups.push(other)
      }

      const buckets: TimeBucket[] = [...rawBuckets.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([bucket, tokensByKey]) => {
          const row: TimeBucket = { bucket }
          for (const k of topGroups.map((g) => g.key)) row[k] = 0
          for (const [k, v] of tokensByKey) {
            if (topKeys.has(k)) {
              row[k] = ((row[k] as number) ?? 0) + v
            } else if (hasOther) {
              row[OTHER_KEY] = ((row[OTHER_KEY] as number) ?? 0) + v
            }
          }
          return row
        })

      return {
        buckets,
        groupKeys,
        totals,
        topGroups,
        resolvedBucket,
        truncatedSources: truncatedSources.length > 0 ? truncatedSources : undefined,
      }
    },
  })
}
