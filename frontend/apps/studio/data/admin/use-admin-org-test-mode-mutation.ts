import { useMutation, useQueryClient } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { organizationKeys } from "@/data/organizations/keys"
import { ResponseError } from "@/types"
import { adminKeys } from "./keys"

export interface AdminOrgTestModeToggleVariables {
  slug: string
  enabled: boolean
}

export interface AdminOrgTestModeToggleResponse {
  slug: string
  is_test_mode: boolean
}

export function useAdminOrgTestModeMutation() {
  const qc = useQueryClient()
  return useMutation<
    AdminOrgTestModeToggleResponse,
    ResponseError,
    AdminOrgTestModeToggleVariables
  >({
    mutationFn: async ({ slug, enabled }) => {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/platform/admin/orgs/${slug}/test-mode`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) {
        let msg = `test-mode toggle failed: ${res.status}`
        try {
          const body = await res.json()
          // The CP's test-mode endpoint returns
          // BOTH `error` (a programmatic code like `"one_way"` or
          // `"stripe_state_present"`) AND `message` (operator-friendly text
          // explaining the constraint + teardown path). Prefer `message`
          // for the toast — `"one_way"` alone is not actionable. B1's
          // `use-admin-org-feature-mutation.ts` checks only `error` because
          // the B1 `/features` endpoint doesn't return `message`; the
          // divergence here is intentional, not inconsistency.
          if (typeof body?.message === "string") msg = body.message
          else if (typeof body?.error === "string") msg = body.error
        } catch {
          /* keep generic message */
        }
        throw new ResponseError(msg, res.status)
      }
      return res.json()
    },
    onSuccess: (_data, { slug }) => {
      qc.invalidateQueries({ queryKey: adminKeys.org(slug) })
      qc.invalidateQueries({ queryKey: [...adminKeys.all, "orgs", "list"] })
      // Also invalidate the Studio's main organizations cache so
      // `is_test_mode` reaches BillingSettings on next render (mirrors B1's
      // feature-flag mutation invalidation pattern).
      qc.invalidateQueries({ queryKey: organizationKeys.list() })
    },
  })
}
