import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { IS_PLATFORM } from "@/lib/constants"
import { ResponseError } from "@/types"
import { adminKeys } from "./keys"

// 5 minutes — off-boarding-lag knob, not a security knob.
// 403-redirect on actual admin endpoints is the real gate.
const STALE_TIME_MS = 5 * 60 * 1000

export function useIsPlatformAdminQuery() {
  return useQuery<{ is_admin: boolean }>({
    queryKey: adminKeys.whoami(),
    // Self-host (IS_PLATFORM=false) has no platform-admin concept and no
    // whoami route — don't fire the request at all (it would hit the baked-in
    // API_URL default and fail). data stays undefined → is_admin defaults false.
    enabled: IS_PLATFORM,
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
