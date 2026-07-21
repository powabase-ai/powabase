import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { adminKeys } from "./keys"

export interface AdminUserDetail {
  user: {
    id: string
    email: string
    created_at: string | null
    last_sign_in_at: string | null
  }
  orgs: Array<{ id: string; name: string; slug: string; role: string; created_at: string | null }>
  projects: Array<{
    id: string
    name: string
    slug: string
    ref: string | null
    organization_id: string
    created_at: string | null
  }>
}

export function useAdminUserQuery(id: string | undefined) {
  return useQuery<AdminUserDetail>({
    queryKey: adminKeys.user(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/platform/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new ResponseError(`user detail failed: ${res.status}`, res.status)
      return res.json()
    },
  })
}
