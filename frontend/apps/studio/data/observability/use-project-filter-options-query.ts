import { useQuery } from "@tanstack/react-query"

import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient"
import { hasAiAuth } from "@/lib/ai-api"
import { observabilityApi } from "@/lib/ai-api/observability-api"
import { observabilityKeys } from "./keys"
import type { ProjectFilterOptions } from "./types"

// Populates the model + agent dropdowns on the observability filter bar.
// Distinct models from agent_runs + all agents, resolved server-side
// by the backend's observability filter-options endpoint.

export function useProjectFilterOptionsQuery(
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { token, ref, isReady } = useProjectSupabaseClient()

  return useQuery<ProjectFilterOptions>({
    queryKey: observabilityKeys.projectFilterOptions(ref),
    enabled: enabled && isReady && hasAiAuth(token),
    queryFn: async () => {
      if (!hasAiAuth(token)) throw new Error("Project client not ready")

      const res = await observabilityApi.getFilterOptions(token, ref)
      const models = res.models.map((m) => ({ value: m, label: m }))
      const agents = res.agents.map((a) => ({
        value: a.id,
        label: a.name ?? a.id,
      }))

      return { models, agents }
    },
  })
}
