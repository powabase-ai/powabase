import { Admonition } from 'ui-patterns/admonition'

import Panel from '@/components/ui/Panel'
import { FreeProjectLimitWarning } from './FreeProjectLimitWarning'
import type { MemberWithFreeProjectLimit } from '@/data/organizations/free-project-limit-check-query'

/**
 * Shown on /new/<slug> when the free-project limit is reached. With the billing
 * UI enabled, surfaces the in-page upgrade CTA (FreeProjectLimitWarning); when
 * it's off (a non-allowlisted org pre-GA), degrades to the contact fallback so
 * the page is not a dead-end redirect. The 1-project limit is server-enforced
 * regardless of the flag, so this panel always renders when the limit is hit.
 */
export function NewProjectLimitReached({
  membersExceededLimit,
  billingUiEnabled,
}: {
  membersExceededLimit: MemberWithFreeProjectLimit[]
  billingUiEnabled: boolean
}) {
  if (billingUiEnabled) {
    return <FreeProjectLimitWarning membersExceededLimit={membersExceededLimit} />
  }
  return (
    <Panel.Content>
      <Admonition
        type="default"
        title="Free plan can only provision 1 project"
        description="Please contact hello@powabase.ai if you want to upgrade."
      />
    </Panel.Content>
  )
}
