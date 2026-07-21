import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL, api } from "@/lib/ai-api"
import { observabilityKeys } from "./keys"
import type { ObservabilityRange, OrgStatsResponse } from "./types"

// ---------------------------------------------------------------------------
// Org-level stats hook. Calls the control-plane aggregator endpoint
// GET /api/platform/organizations/<slug>/stats?range=&metric=[&scope=platform]
//
// The endpoint is added in Phase 3 (control-plane). Until Phase 3 lands, this
// query will error with a 404 — component callers should show a "Stats endpoint
// not yet deployed" empty state. Once Phase 3 ships, no client change needed.
// ---------------------------------------------------------------------------

// `cost` is not part of the live contract: the cost pipeline never shipped.
// Tokens are the live token-throughput equivalent. Callers default to "tokens".
export type OrgStatsMetric = "tokens" | "runs" | "errors"

interface OrgStatsVariables {
  slug: string | undefined
  range?: ObservabilityRange
  metric?: OrgStatsMetric
  scope?: "org" | "platform"
  /** Skip the request entirely. Use when the caller knows the user has no
   * chance of being authorized (e.g. admin page before the client-side
   * admin check) — avoids a guaranteed-403 round trip per page load. */
  enabled?: boolean
}

export function useOrgStatsQuery({
  slug,
  range = "7d",
  metric = "tokens",
  scope = "org",
  enabled = true,
}: OrgStatsVariables) {
  return useQuery<OrgStatsResponse>({
    queryKey:
      scope === "platform"
        ? observabilityKeys.platformStats(range, metric)
        : observabilityKeys.orgStats(slug, range, metric),
    enabled: enabled && (scope === "platform" || !!slug),
    staleTime: 60_000,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: async () => {
      const token = await getAccessToken()
      const scopeQs = scope === "platform" ? "&scope=platform" : ""
      const endpoint =
        scope === "platform"
          ? `${API_URL}/platform/admin/usage?range=${range}&metric=${metric}${scopeQs}`
          : `${API_URL}/platform/organizations/${slug}/stats?range=${range}&metric=${metric}`
      return api<OrgStatsResponse>(endpoint, { token: token ?? undefined })
    },
  })
}

// Convenience wrapper for the platform-operator admin page.
export function usePlatformStatsQuery({
  range = "24h",
  metric = "tokens",
  enabled = true,
}: {
  range?: ObservabilityRange
  metric?: OrgStatsMetric
  enabled?: boolean
} = {}) {
  return useOrgStatsQuery({ slug: undefined, range, metric, scope: "platform", enabled })
}
