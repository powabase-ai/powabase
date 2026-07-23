import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL, api } from "@/lib/ai-api"
import { observabilityKeys } from "./keys"

// Thin wrapper around the control-plane /admin/prom PromQL passthrough.
// Server-side enforces the metric allowlist so there's
// nothing to sanitize client-side — but the UI should only ever call this with
// metrics we know we've allowlisted.

export interface PromInstantResult {
  status: "success" | "error"
  data?: {
    resultType: "vector" | "matrix" | "scalar" | "string"
    result: Array<{
      metric: Record<string, string>
      value?: [number, string]
      values?: Array<[number, string]>
    }>
  }
  error?: string
  errorType?: string
}

export interface PromQueryVariables {
  query: string
  range?: "1h" | "6h" | "24h"
  /** Step size in seconds. Default 60. Only used when range is set (range query). */
  stepSec?: number
  /** Skip the request entirely. Useful when the caller is gated by a
   * client-side admin check that runs in the same render — avoids a
   * guaranteed-403 round trip per page load for non-admins. */
  enabled?: boolean
}

export function usePromQuery({ query, range, stepSec = 60, enabled = true }: PromQueryVariables) {
  return useQuery<PromInstantResult>({
    queryKey: observabilityKeys.prom(query, range ?? "instant"),
    enabled: enabled && !!query,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async () => {
      const token = await getAccessToken()
      const qs = new URLSearchParams({ query })
      if (range) {
        const now = Math.floor(Date.now() / 1000)
        const span = range === "1h" ? 3600 : range === "6h" ? 21600 : 86400
        qs.set("start", String(now - span))
        qs.set("end", String(now))
        qs.set("step", String(stepSec))
      }
      return api<PromInstantResult>(
        `${API_URL}/platform/admin/prom?${qs.toString()}`,
        { token: token ?? undefined },
      )
    },
  })
}
