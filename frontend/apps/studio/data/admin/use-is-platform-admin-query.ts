import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { adminKeys } from "./keys"

// 5 minutes — off-boarding-lag knob, not a security knob.
// 403-redirect on actual admin endpoints is the real gate.
const STALE_TIME_MS = 5 * 60 * 1000

export function useIsPlatformAdminQuery() {
  return useQuery<{ is_admin: boolean }>({
    queryKey: adminKeys.whoami(),
    staleTime: STALE_TIME_MS,
    // Gate check — fail fast on non-401 errors rather than retrying.
    // A plain Error from this hook would otherwise get retried 3 times
    // by the default retry policy.
    retry: false,
    queryFn: async () => {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/platform/admin/whoami`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        // 401 (no session) → treat as not-admin
        if (res.status === 401) return { is_admin: false }
        throw new ResponseError(`whoami failed: ${res.status}`, res.status)
      }
      return res.json()
    },
  })
}
