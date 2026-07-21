import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { extractErrorMessage } from "./http"
import { adminKeys } from "./keys"

export interface AdminOrgDetail {
  org: {
    id: string
    name: string
    slug: string
    owner_id: string
    plan_id: string
    enabled_features: string[]
    is_test_mode: boolean
    trust_state: string
    /** Net on-us credit balance in millicents (100_000 = $1). */
    balance_millicents: number
    created_at: string | null
  }
  members: Array<{ user_id: string; email: string; role: string; created_at: string | null }>
  projects: Array<{
    id: string
    name: string
    slug: string
    ref: string | null
    created_at: string | null
  }>
}

export function useAdminOrgQuery(slug: string | undefined) {
  return useQuery<AdminOrgDetail>({
    queryKey: adminKeys.org(slug ?? ""),
    enabled: !!slug,
    queryFn: async () => {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/platform/admin/orgs/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new ResponseError(await extractErrorMessage(res, "org detail failed"), res.status)
      return res.json()
    },
  })
}
