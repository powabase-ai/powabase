import { useQuery } from "@tanstack/react-query"

import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient"
import { hasAiAuth } from "@/lib/ai-api"
import { observabilityApi } from "@/lib/ai-api/observability-api"
import { observabilityKeys } from "./keys"
import type { ObservabilityRange, TimeBucket } from "./types"

// Agent-runs time series: stacked bar (completed/failed/running) by hour/day,
// plus p95 duration overlay.
//
// Postgrest won't do aggregations, so this hook fetches raw rows in the
// range and buckets client-side. Safe because the window is bounded
// (7d is the default max) and the count/row size is small.

interface AgentRunRow {
  id: string
  status: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  /** Failure message captured by the backend when status=='failed'.
   *  Pulled into the SELECT so the recent-failures table renders the actual
   *  error text instead of the literal string "failed". */
  error: string | null
}

export interface AgentRunsChartData {
  buckets: TimeBucket[]
  /** Last N failed rows for the "recent errors" table. */
  recentFailures: AgentRunRow[]
  total: number
}

// Only the preset ranges have a fixed window length. "custom" is unsupported
// here (this hook is fed the preset fallback by callers) and "90d" matches
// the observability page expansion.
const RANGE_MS: Record<Exclude<ObservabilityRange, "custom">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
}

function rangeMs(range: ObservabilityRange): number {
  if (range === "custom") return RANGE_MS["30d"] // fallback if ever hit
  return RANGE_MS[range]
}

function bucketFor(iso: string, range: ObservabilityRange): string {
  const d = new Date(iso)
  if (range === "1h") {
    d.setUTCSeconds(0, 0)
  } else if (range === "24h") {
    d.setUTCMinutes(0, 0, 0)
  } else {
    d.setUTCHours(0, 0, 0, 0)
  }
  return d.toISOString()
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}

export function useProjectAgentRunsQuery(
  range: ObservabilityRange = "24h",
  { enabled = true, refetchIntervalMs = 30_000 }: { enabled?: boolean; refetchIntervalMs?: number } = {},
) {
  const { token, ref, isReady } = useProjectSupabaseClient()

  return useQuery<AgentRunsChartData>({
    queryKey: observabilityKeys.projectAgentRuns(ref, range),
    enabled: enabled && isReady && hasAiAuth(token),
    refetchInterval: refetchIntervalMs,
    queryFn: async () => {
      if (!hasAiAuth(token)) throw new Error("Project client not ready")

      const since = new Date(Date.now() - rangeMs(range)).toISOString()
      const res = await observabilityApi.listAgentRuns(token, ref, { since, limit: 5000 })

      const rows = res.runs as AgentRunRow[]

      const bucketMap = new Map<string, { completed: number; failed: number; running: number; durations: number[] }>()
      for (const row of rows) {
        if (!row.created_at) continue
        const b = bucketFor(row.created_at, range)
        const entry = bucketMap.get(b) ?? { completed: 0, failed: 0, running: 0, durations: [] }
        if (row.status === "completed") entry.completed += 1
        else if (row.status === "failed") entry.failed += 1
        else entry.running += 1
        if (row.started_at && row.completed_at) {
          const dur = (new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) / 1000
          if (Number.isFinite(dur) && dur >= 0) entry.durations.push(dur)
        }
        bucketMap.set(b, entry)
      }

      const buckets: TimeBucket[] = [...bucketMap.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([bucket, s]) => ({
          bucket,
          completed: s.completed,
          failed: s.failed,
          running: s.running,
          p95DurationSec: Math.round(percentile(s.durations, 0.95) * 100) / 100,
        }))

      const recentFailures = rows.filter((r) => r.status === "failed").slice(0, 20)

      return {
        buckets,
        recentFailures,
        total: rows.length,
      }
    },
  })
}
