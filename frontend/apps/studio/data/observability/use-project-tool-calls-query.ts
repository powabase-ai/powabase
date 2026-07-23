import { useQuery } from "@tanstack/react-query"

import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient"
import { hasAiAuth } from "@/lib/ai-api"
import { observabilityApi } from "@/lib/ai-api/observability-api"
import { observabilityKeys } from "./keys"
import type {
  ObservabilityRange,
  ProjectToolCallsData,
  TokenDateRange,
  TokenFilters,
  ToolCallRollup,
} from "./types"

// Reads ai.tool_call_events (populated at agent-run write time by
// the backend) and rolls up per-tool stats for the dashboard's
// tool-call panels. Client-side aggregation to stay consistent with the
// tokens query path.

const RANGE_MS: Record<Exclude<ObservabilityRange, "custom">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
}

function resolveWindow(
  range: ObservabilityRange,
  custom: TokenDateRange | undefined,
): { since: string; until: string } {
  if (range === "custom" && custom) {
    return {
      since: new Date(custom.from).toISOString(),
      until: new Date(custom.to).toISOString(),
    }
  }
  const ms = RANGE_MS[range as Exclude<ObservabilityRange, "custom">]
  const until = new Date()
  const since = new Date(until.getTime() - ms)
  return { since: since.toISOString(), until: until.toISOString() }
}

interface ToolCallRow {
  tool_name: string
  status: "success" | "error"
  duration_ms: number | null
  agent_id: string | null
  model: string | null
  occurred_at: string | null
}

function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[Math.max(0, idx)]
}

interface ProjectToolCallsQueryArgs {
  range: ObservabilityRange
  filters: TokenFilters
  /** Required when range === "custom"; ignored otherwise. */
  customRange?: TokenDateRange
}

export function useProjectToolCallsQuery(
  { range, filters, customRange }: ProjectToolCallsQueryArgs,
  { enabled = true, refetchIntervalMs = 60_000 }: { enabled?: boolean; refetchIntervalMs?: number } = {},
) {
  const { token, ref, isReady } = useProjectSupabaseClient()
  const filtersKey = JSON.stringify({
    m: [...filters.models].sort(),
    a: [...filters.agents].sort(),
    s: filters.source,
    cr: range === "custom" ? customRange : null,
  })

  return useQuery<ProjectToolCallsData>({
    queryKey: observabilityKeys.projectToolCalls(ref, range, filtersKey),
    enabled: enabled && isReady && hasAiAuth(token),
    refetchInterval: refetchIntervalMs,
    queryFn: async () => {
      if (!hasAiAuth(token)) throw new Error("Project client not ready")
      const { since, until } = resolveWindow(range, customRange)

      const res = await observabilityApi.listToolCalls(token, ref, {
        since,
        until,
        models: filters.models,
        agentIds: filters.agents,
        limit: 50_000,
      })
      const rows = res.events as ToolCallRow[]

      const byTool = new Map<
        string,
        { calls: number; errors: number; durations: number[] }
      >()
      let totalCalls = 0
      let totalErrors = 0
      let totalDuration = 0
      let durationSamples = 0

      for (const r of rows) {
        const tool = r.tool_name || "unknown"
        const bucket = byTool.get(tool) ?? { calls: 0, errors: 0, durations: [] }
        bucket.calls += 1
        if (r.status === "error") bucket.errors += 1
        if (typeof r.duration_ms === "number") {
          bucket.durations.push(r.duration_ms)
          totalDuration += r.duration_ms
          durationSamples += 1
        }
        byTool.set(tool, bucket)
        totalCalls += 1
        if (r.status === "error") totalErrors += 1
      }

      const rollups: ToolCallRollup[] = [...byTool.entries()]
        .map(([tool, b]) => ({
          tool,
          calls: b.calls,
          errors: b.errors,
          avgDurationMs:
            b.durations.length > 0
              ? Math.round(
                  b.durations.reduce((s, n) => s + n, 0) / b.durations.length,
                )
              : 0,
          p95DurationMs: Math.round(p95(b.durations)),
        }))
        .sort((a, b) => b.calls - a.calls)

      return {
        rollups,
        totals: {
          calls: totalCalls,
          errors: totalErrors,
          avgDurationMs: durationSamples > 0 ? Math.round(totalDuration / durationSamples) : 0,
          uniqueTools: byTool.size,
        },
      }
    },
  })
}
