import { useQuery } from "@tanstack/react-query"

import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient"
import { hasAiAuth } from "@/lib/ai-api"
import { observabilityApi } from "@/lib/ai-api/observability-api"
import { observabilityKeys } from "./keys"
import type { HealthSummary, ObservabilityRange } from "./types"

// ---------------------------------------------------------------------------
// Per-project health summary (the 5 stat cards at the top of /observability)
//
// The 5 counts are computed server-side in one round trip
// by the backend's observability health endpoint — previously 5
// separate PostgREST count-only requests. The thresholds (24h failed-run
// window, 10min stuck-extraction, 5min stuck-workflow) are fixed on the
// backend, matching this hook's `range` param having never actually been
// used to vary them (kept as a queryKey input only, unchanged here).
// ---------------------------------------------------------------------------

export function useProjectHealthQuery(
  range: ObservabilityRange = "24h",
  { enabled = true, refetchIntervalMs = 30_000 }: { enabled?: boolean; refetchIntervalMs?: number } = {},
) {
  const { token, ref, isReady } = useProjectSupabaseClient()

  return useQuery<HealthSummary>({
    queryKey: observabilityKeys.projectHealth(ref, range),
    enabled: enabled && isReady && hasAiAuth(token),
    refetchInterval: refetchIntervalMs,
    queryFn: async () => {
      if (!hasAiAuth(token)) throw new Error("Project client not ready")
      return observabilityApi.getHealth(token, ref)
    },
  })
}
