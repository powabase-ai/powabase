import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import type { AdminProjectActivityRow } from "./use-admin-project-query"
import { extractErrorMessage } from "./http"
import { adminKeys } from "./keys"

interface Params {
  ref: string | undefined
  action?: string
  limit?: number
  offset?: number
  /** Seed for the initial (action="", offset=0) view — the latest page already
   * embedded in the project-detail response, so the first paint needs no extra
   * round-trip. Ignored once the operator filters or pages. */
  initialData?: { activity: AdminProjectActivityRow[]; total: number }
}

/**
 * Paginated + action-filtered project activity feed, backed by
 * GET /platform/admin/projects/<ref>/activity. Split from the project-detail
 * query so an operator can page back through history and filter out
 * high-frequency actions (e.g. an hourly compute_hourly flood).
 */
export function useAdminProjectActivityQuery({
  ref,
  action = "",
  limit = 50,
  offset = 0,
  initialData,
}: Params) {
  const isInitialView = action === "" && offset === 0
  return useQuery<{ activity: AdminProjectActivityRow[]; total: number }>({
    queryKey: adminKeys.projectActivity(ref ?? "", action, limit, offset),
    enabled: !!ref,
    queryFn: async () => {
      const token = await getAccessToken()
      const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      if (action) qs.set("action", action)
      const res = await fetch(`${API_URL}/platform/admin/projects/${ref}/activity?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new ResponseError(await extractErrorMessage(res, "activity load failed"), res.status)
      return res.json()
    },
    initialData: isInitialView ? initialData : undefined,
    // Keep the prior page visible while the next one loads — avoids a skeleton
    // flash and a transient total=0 on page flips.
    placeholderData: keepPreviousData,
  })
}
