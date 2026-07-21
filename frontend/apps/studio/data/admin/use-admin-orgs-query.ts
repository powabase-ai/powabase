import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { extractErrorMessage } from "./http"
import { adminKeys } from "./keys"

export interface AdminOrgRow {
  id: string
  name: string
  slug: string
  owner_id: string
  member_count: number
  project_count: number
  enabled_features: string[]
  is_test_mode: boolean
  trust_state: string
  /** Net on-us credit balance in millicents (100_000 = $1). */
  balance_millicents: number
  created_at: string | null
}

interface Params {
  q?: string
  limit?: number
  offset?: number
  sort?: string
}

export function useAdminOrgsQuery({
  q = "",
  limit = 50,
  offset = 0,
  sort = "created_at:desc",
}: Params = {}) {
  return useQuery<{ orgs: AdminOrgRow[]; total: number }>({
    queryKey: adminKeys.orgsList(q, limit, offset, sort),
    queryFn: async () => {
      const token = await getAccessToken()
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        sort,
      })
      if (q) qs.set("q", q)
      const res = await fetch(`${API_URL}/platform/admin/orgs?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new ResponseError(await extractErrorMessage(res, "orgs list failed"), res.status)
      return res.json()
    },
    // Retain the prior page's rows + total while the next page loads, so the
    // pagination footer never sees a transient total of 0 (which would clamp
    // `page` back to 0). Also avoids a skeleton flash on every page flip.
    placeholderData: keepPreviousData,
  })
}
