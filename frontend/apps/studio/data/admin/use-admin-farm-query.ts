import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { adminKeys } from "./keys"

// Latest FarmVerdict facets for a flagged org. `tier` is one of
// convict|watch|clean|protect; `action` is one of
// block|pause|release|drain|delete|allowlist|none (see platform.FarmVerdict).
export interface AdminFarmVerdict {
  tier: string
  reasons: string[]
  rationale: string | null
  action: string | null
  created_at: string | null
}

export interface AdminFarmOrgRow {
  id: string
  slug: string
  email: string | null
  trust_state: string
  verdict: AdminFarmVerdict | null
}

const DEFAULT_STATE = "gated,convicted"

export function useAdminFarmQuery(state: string = DEFAULT_STATE) {
  return useQuery<AdminFarmOrgRow[]>({
    queryKey: adminKeys.farmFlagged(state),
    queryFn: async () => {
      const token = await getAccessToken()
      const res = await fetch(
        `${API_URL}/platform/admin/farm/flagged?state=${encodeURIComponent(state)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new ResponseError(`farm flagged list failed: ${res.status}`, res.status)
      return res.json()
    },
  })
}
