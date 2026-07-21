// Shared types for observability queries. Kept narrow so chart primitives
// can be typed without pulling in Supabase row types.

// Range presets. "custom" pairs with a TokenDateRange to scope the query
// to an arbitrary [from, to] window.
export type ObservabilityRange = "1h" | "24h" | "7d" | "30d" | "90d" | "custom"

/** Granularity for the X-axis bucket. "auto" picks based on the active range. */
export type TimeBucketSize = "auto" | "minute" | "hour" | "day" | "week"

/** Custom-range bounds (ISO strings). Only honored when `range === "custom"`. */
export interface TokenDateRange {
  /** ISO-8601 inclusive lower bound. */
  from: string
  /** ISO-8601 exclusive upper bound. */
  to: string
}

export interface TimeBucket {
  /** ISO-8601 bucket start, truncated to the range's granularity (hour for <=24h, day otherwise) */
  bucket: string
  [series: string]: number | string | null
}

export interface StatusCount {
  status: string
  count: number
}

export interface HealthSummary {
  activeRuns: number
  failedRuns24h: number
  stuckExtractions: number
  failedIndexedSources: number
  runningWorkflows: number
}

/** Which dimension the tokens chart and top-N table group by. */
export type TokenGroupBy = "model" | "agent" | "type" | "day" | "tool"

/** Which run table the tokens query reads. "all" unions agent + orch + wf_block. */
export type TokenSourceType = "agent_runs" | "orchestration_runs" | "workflow_block_logs" | "all"

/** Active filter set shared across the tokens + tool-calls queries. */
export interface TokenFilters {
  models: string[]
  agents: string[]
  source: TokenSourceType
}

/** Per-group totals rolled up from the run tables. */
export interface TokenGroupTotals {
  key: string
  /** Human label for display (agent name, model name, block type, day ISO, tool name). */
  label: string
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  totalTokens: number
  runCount: number
  failedCount: number
}

export interface ProjectTokensData {
  buckets: TimeBucket[]
  groupKeys: string[]
  totals: {
    promptTokens: number
    completionTokens: number
    reasoningTokens: number
    totalTokens: number
    runCount: number
  }
  topGroups: TokenGroupTotals[]
  /** Bucket granularity actually used (after "auto" resolution). Lets the
   * page pick a sensible X-axis tick format. */
  resolvedBucket: Exclude<TimeBucketSize, "auto">
  /** Names of source tables whose query hit the 50k row cap. The page uses
   *  this to surface an overflow banner — without it, busy projects'
   *  charts silently misrepresent the busiest windows. Long-term, push
   *  aggregation to a Postgres RPC; the cap goes away with it. */
  truncatedSources?: Array<"agent_runs" | "orchestration_runs" | "workflow_block_logs">
}

/** Per-tool rollup row for the tool-call panels. */
export interface ToolCallRollup {
  tool: string
  calls: number
  errors: number
  avgDurationMs: number
  p95DurationMs: number
}

export interface ProjectToolCallsData {
  rollups: ToolCallRollup[]
  totals: {
    calls: number
    errors: number
    avgDurationMs: number
    uniqueTools: number
  }
}

export interface FilterOptionValue {
  value: string
  label: string
}

export interface ProjectFilterOptions {
  models: FilterOptionValue[]
  agents: FilterOptionValue[]
}

export interface OrgStatsResponse {
  /** Slug of the org being reported on. */
  slug: string
  /** Range used to compute the series. */
  range: ObservabilityRange
  /** Metric selector echoed back. `cost` is not in the live contract —
   *  the cost pipeline never shipped — so token-based metrics are the
   *  closest equivalent. */
  metric: "tokens" | "runs" | "errors"
  /** One row per project in the org. Used for the per-project table. */
  projects: Array<{
    ref: string
    name: string
    agentRuns: number
    failedRuns: number
    totalTokens: number
    lastActivityAt: string | null
  }>
  /** Time series, keyed by (bucket, projectRef). For token/run overlays. */
  series: Array<{
    bucket: string
    projectRef: string
    value: number
  }>
}

export interface PromInstantResponse {
  /** Timestamp (ms since epoch) of the sample. */
  t: number
  /** Labels from the Prometheus series. */
  labels: Record<string, string>
  /** Sample value. */
  value: number
}
