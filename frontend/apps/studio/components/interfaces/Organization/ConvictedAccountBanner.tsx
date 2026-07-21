import { SupportCategories } from '@supabase/shared-types/out/constants'
import { Alert_Shadcn_, AlertDescription_Shadcn_, AlertTitle_Shadcn_ } from 'ui'

import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'

/**
 * Farm-defense "account under review" banner (Task 10a). Shows proactively
 * whenever the selected org's `trust_state === 'convicted'` — the same state
 * that makes the T6 provisioning gate return 403 `account_under_review`.
 *
 * `trust_state` and `ticket_url` are threaded onto the org payload by the CP
 * serializer (`routes/platform_helpers.py::build_org_response`); neither is in
 * the upstream OpenAPI spec (`api-types`), so they're read via the same `as`
 * cast pattern B1 uses for `enabled_features` / `is_test_mode`
 * (`useIsBillingUiEnabled` / `useIsBillingTestMode`). `ticket_url` comes from
 * the CP `FARM_DEFENSE_TICKET_URL` config; the "Contact support" link ALWAYS
 * renders — it points at that external help desk when set, else falls back to
 * the in-app Support form (`/support/new`) prefilled for this org. A convict is
 * permanent (admin-only recovery), so the recovery path must never be missing.
 */
export function ConvictedAccountBanner() {
  const { data: org } = useSelectedOrganizationQuery()

  const trustState = (org as { trust_state?: string } | null | undefined)?.trust_state
  if (!org || trustState !== 'convicted') return null

  // External help desk if ops set one, else the in-app Support form prefilled for this org
  // (orgSlug + a relevant category + subject). The link is never omitted.
  const ticketUrl = (org as { ticket_url?: string } | null | undefined)?.ticket_url
  const slug = (org as { slug?: string } | null | undefined)?.slug ?? ''
  const supportHref =
    ticketUrl ||
    `/support/new?orgSlug=${encodeURIComponent(slug)}` +
      `&category=${SupportCategories.LOGIN_ISSUES}` +
      `&subject=${encodeURIComponent('Account under review')}`

  return (
    <Alert_Shadcn_
      data-testid="convicted-account-banner"
      variant="destructive"
      className="rounded-none border-x-0 border-t-0"
    >
      <AlertTitle_Shadcn_>Your account is under review</AlertTitle_Shadcn_>
      <AlertDescription_Shadcn_ className="flex flex-wrap items-center gap-x-3">
        <span>
          Your account is under review for unusual activity. Contact us to restore access.
        </span>
        <a href={supportHref} className="font-medium underline">
          Contact support
        </a>
      </AlertDescription_Shadcn_>
    </Alert_Shadcn_>
  )
}
