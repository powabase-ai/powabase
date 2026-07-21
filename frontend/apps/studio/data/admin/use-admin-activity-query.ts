import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { adminKeys } from "./keys"

interface AdminEventBase {
  id: string
  label: string
  created_at: string | null
}

export type AdminEvent =
  | (AdminEventBase & { type: "user_signup"; slug: null; ref: null })
  | (AdminEventBase & { type: "org_created"; slug: string; ref: null })
  | (AdminEventBase & { type: "project_created"; slug: null; ref: string })

export type AdminEventType = AdminEvent["type"]

export function useAdminActivityQuery(limit = 20) {
  return useQuery<{ events: AdminEvent[] }>({
    queryKey: adminKeys.activity(limit),
    queryFn: async () => {
      const token = await getAccessToken()
      const res = await fetch(
        `${API_URL}/platform/admin/activity?limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new ResponseError(`activity failed: ${res.status}`, res.status)
      return res.json()
    },
  })
}
