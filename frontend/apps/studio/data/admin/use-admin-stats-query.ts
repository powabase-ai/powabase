import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { adminKeys } from "./keys"

export interface AdminStats {
  users_total: number
  orgs_total: number
  projects_total: number
  projects_active: number
  projects_paused: number
  signups_7d: number
}

export function useAdminStatsQuery() {
  return useQuery<AdminStats>({
    queryKey: adminKeys.stats(),
    queryFn: async () => {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/platform/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new ResponseError(`stats failed: ${res.status}`, res.status)
      return res.json()
    },
  })
}
