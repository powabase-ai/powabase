import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { extractErrorMessage } from "./http"
import { adminKeys } from "./keys"

export interface AdminUserRow {
  id: string
  email: string
  created_at: string | null
  last_sign_in_at: string | null
  org_count: number
  project_count: number
  /** Projects in state='paused' (what a conviction/suspend does) across the
   * user's orgs — a subset of project_count, surfaced so a flagged user's
   * project total isn't read as live. */
  paused_project_count: number
  /** Worst trust_state among orgs this user owns (gated|convicted), else null. */
  flag_state: string | null
}

interface Params {
  q?: string
  limit?: number
  offset?: number
  sort?: string
}

export function useAdminUsersQuery({
  q = "",
  limit = 50,
  offset = 0,
  sort = "created_at:desc",
}: Params = {}) {
  return useQuery<{ users: AdminUserRow[]; total: number }>({
    queryKey: adminKeys.usersList(q, limit, offset, sort),
    queryFn: async () => {
      const token = await getAccessToken()
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        sort,
      })
      if (q) qs.set("q", q)
      const res = await fetch(`${API_URL}/platform/admin/users?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new ResponseError(await extractErrorMessage(res, "users list failed"), res.status)
      return res.json()
    },
    // Retain the prior page's rows + total while the next page loads, so the
    // pagination footer never sees a transient total of 0 (which would clamp
    // `page` back to 0). Also avoids a skeleton flash on every page flip.
    placeholderData: keepPreviousData,
  })
}
