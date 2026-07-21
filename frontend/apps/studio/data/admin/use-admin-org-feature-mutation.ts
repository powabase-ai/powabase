import { useMutation, useQueryClient } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { organizationKeys } from "@/data/organizations/keys"
import { adminKeys } from "./keys"

export type AdminToggleableFeature = "billing:plan_picker"

export interface AdminOrgFeatureToggleVariables {
  slug: string
  feature: AdminToggleableFeature
  enabled: boolean
}

export interface AdminOrgFeatureToggleResponse {
  enabled_features: string[]
}

/**
 * Toggle a feature key in an org's `enabled_features` array (DB-stored
 * per-org allowlist). Used by the admin orgs page "Enable plan-picker"
 * action — the runtime path that replaces the FE-rebuild ceremony described
 * in the runbook §3g pre-cutover smoke flow.
 *
 * On success we invalidate the orgs list + the specific org detail so the
 * row's badge updates immediately.
 */
export function useAdminOrgFeatureToggleMutation() {
  const qc = useQueryClient()
  return useMutation<
    AdminOrgFeatureToggleResponse,
    ResponseError,
    AdminOrgFeatureToggleVariables
  >({
    mutationFn: async ({ slug, feature, enabled }) => {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/platform/admin/orgs/${slug}/features`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feature, enabled }),
      })
      if (!res.ok) {
        let msg = `feature toggle failed: ${res.status}`
        try {
          const body = await res.json()
          if (typeof body?.error === "string") msg = body.error
        } catch {
          // body wasn't JSON; keep generic message
        }
        throw new ResponseError(msg, res.status)
      }
      return res.json()
    },
    onSuccess: (_data, { slug }) => {
      qc.invalidateQueries({ queryKey: adminKeys.org(slug) })
      // Prefix-invalidate every paginated orgsList variant (q/sort/page combos)
      // by matching the ["admin", "orgs", "list", ...] prefix.
      qc.invalidateQueries({ queryKey: [...adminKeys.all, "orgs", "list"] })
      // ALSO invalidate the Studio's user-facing organizations cache —
      // `useSelectedOrganizationQuery` reads from this key, and
      // `BillingSettings` reads `enabled_features` off that returned org.
      // Without this the picker stays hidden after a flag flip because the
      // org row in the cache predates the new column.
      qc.invalidateQueries({ queryKey: organizationKeys.list() })
    },
  })
}
