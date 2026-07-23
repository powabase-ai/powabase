import { useIsFeatureEnabled } from "@/hooks/misc/useIsFeatureEnabled"

/**
 * The single per-org master switch for ALL billing UI — the B1 plan picker,
 * the B2 compute-tier surfaces (create-flow picker, project-homepage badge +
 * Manage compute link, the Infrastructure compute picker), and any future
 * billing surfaces (B5/B6).
 *
 * Returns true if ANY of:
 *   (a) the bundled `billing:plan_picker` JSON default is true (post-GA), or
 *   (b) the current org's `enabled_features` array contains
 *       `billing:plan_picker` (operator-enabled per-org allowlist; the
 *       runbook §3g pre-cutover smoke path).
 *
 * `enabled_features` is set by the admin "Enable billing UI" toggle in
 * `/admin/orgs` (or via `flask billing allowlist-org`); it lands in the
 * `platform.organizations.enabled_features TEXT[]` column added in
 * migration 0018 and is included in every `/api/platform/organizations`
 * response. Untyped via `as any` because the openapi-fetch types aren't
 * regenerated for the fork's CP extensions; the field is documented in
 * the CP's own serializer.
 */
export function useIsBillingUiEnabled(
  org: { slug?: string } | null | undefined
): boolean {
  const { billingPlanPicker } = useIsFeatureEnabled(["billing:plan_picker"])
  if (billingPlanPicker) return true

  const orgFeatures =
    ((org as { enabled_features?: string[] } | null | undefined)?.enabled_features) ?? []
  return orgFeatures.includes("billing:plan_picker")
}
