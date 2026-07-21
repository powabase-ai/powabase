/**
 * Platform-operator org action hooks for the admin dashboard. Each wraps an
 * existing `@require_platform_admin` control-plane endpoint:
 *
 *   trust       POST   /platform/admin/organizations/<slug>/farm/trust   {state}
 *   drain       POST   /platform/admin/organizations/<slug>/farm/drain
 *   delete      DELETE /platform/admin/organizations/<slug>/farm
 *   grant       POST   /platform/organizations/<slug>/credits/grant      {amount, reason}
 *   set-balance POST   /platform/organizations/<slug>/credits/set-balance {target_millicents, reason}
 *
 * Credit amounts are in basis-point units where 100_000 = $1 (same scale for
 * grant `amount` and `target_millicents`); the UI converts dollars → units.
 */
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { organizationKeys } from "@/data/organizations/keys"
import { ResponseError } from "@/types"
import { extractErrorMessage } from "./http"
import { adminKeys } from "./keys"

/**
 * Invalidate every admin surface that a mutation on `slug` can affect.
 * Returns the combined refetch promise so callers can `await` it from
 * `onSuccess` — react-query then settles the mutation (and fires the
 * call-site `onSuccess` toast) only after the refetches resolve, so the
 * success toast can't race ahead of a stale list (e.g. Delete's
 * `router.push` landing before the orgs-list refetch).
 */
function invalidateOrgAdmin(qc: QueryClient, slug: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: adminKeys.org(slug) }),
    qc.invalidateQueries({ queryKey: [...adminKeys.all, "orgs", "list"] }),
    // Trust changes alter the derived per-user flag_state, too.
    qc.invalidateQueries({ queryKey: [...adminKeys.all, "users", "list"] }),
    qc.invalidateQueries({ queryKey: [...adminKeys.all, "farm"] }),
    qc.invalidateQueries({ queryKey: organizationKeys.list() }),
  ])
}

async function postJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const msg = await extractErrorMessage(res, "request failed")
    // Mirror to the console so a destructive-action failure (suspend/drain/
    // delete/credit) leaves a durable trail beyond the ephemeral toast.
    console.error(`admin action failed: ${method} ${path} → ${res.status}: ${msg}`)
    throw new ResponseError(msg, res.status)
  }
  return res.json()
}

export type AdminTrustState = "trusted" | "convicted"

export function useAdminOrgTrustMutation() {
  const qc = useQueryClient()
  return useMutation<
    { slug: string; trust_state: string; warnings?: string[] },
    ResponseError,
    { slug: string; state: AdminTrustState }
  >({
    mutationFn: ({ slug, state }) =>
      postJson(`/platform/admin/organizations/${slug}/farm/trust`, "POST", { state }),
    onSuccess: (_d, { slug }) => invalidateOrgAdmin(qc, slug),
  })
}

export function useAdminOrgDrainMutation() {
  const qc = useQueryClient()
  return useMutation<{ slug: string; frozen_credits: number }, ResponseError, { slug: string }>({
    mutationFn: ({ slug }) =>
      postJson(`/platform/admin/organizations/${slug}/farm/drain`, "POST"),
    onSuccess: (_d, { slug }) => invalidateOrgAdmin(qc, slug),
  })
}

export function useAdminOrgDeleteMutation() {
  const qc = useQueryClient()
  return useMutation<
    // `warnings` is present when the org row was deleted but one or more
    // per-project deprovisions failed — the cluster has orphaned stacks the
    // operator must clean up. The backend still returns 200, so the FE MUST
    // surface these (see OrgActionsPanel delete onSuccess).
    { message: string; slug: string; warnings?: string[] },
    ResponseError,
    { slug: string }
  >({
    mutationFn: ({ slug }) =>
      postJson(`/platform/admin/organizations/${slug}/farm`, "DELETE"),
    onSuccess: (_d, { slug }) => invalidateOrgAdmin(qc, slug),
  })
}

export function useAdminOrgGrantMutation() {
  const qc = useQueryClient()
  return useMutation<
    { id: string; amount: number },
    ResponseError,
    { slug: string; amount: number; reason: string }
  >({
    mutationFn: ({ slug, amount, reason }) =>
      postJson(`/platform/organizations/${slug}/credits/grant`, "POST", { amount, reason }),
    onSuccess: (_d, { slug }) => invalidateOrgAdmin(qc, slug),
  })
}

export interface AdminSetBalanceResponse {
  slug: string
  previous_balance_millicents: number
  target_millicents: number
  new_balance_millicents: number
  applied_delta_millicents: number
  idempotent_replay: boolean
}

export function useAdminOrgSetBalanceMutation() {
  const qc = useQueryClient()
  return useMutation<
    AdminSetBalanceResponse,
    ResponseError,
    { slug: string; target_millicents: number; reason: string }
  >({
    mutationFn: ({ slug, target_millicents, reason }) =>
      postJson(`/platform/organizations/${slug}/credits/set-balance`, "POST", {
        target_millicents,
        reason,
      }),
    onSuccess: (_d, { slug }) => invalidateOrgAdmin(qc, slug),
  })
}
