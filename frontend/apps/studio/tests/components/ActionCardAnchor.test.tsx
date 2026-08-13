/**
 * `tables.new-table-button` only mounts in the table-editor product menu when
 * the menu is visible, the viewport is non-mobile, and the schema is unlocked —
 * in every other state the create-table guide's step 0 was a guaranteed anchor
 * timeout (smoke-test latent risk, 2026-08-12). The NewTab page's "Create a
 * table" ActionCard renders in the main content area regardless, so it carries
 * the same anchor as a second mount point (useAnchorRect scans ALL matches and
 * takes the first with a real box). That requires ActionCard to forward rest
 * props onto its box-generating root — pinned here.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Table2 } from 'lucide-react'

import { ActionCard } from '@/components/layouts/Tabs/ActionCard'
import {
  ONBOARDING_ANCHORS,
  ONBOARDING_ATTR,
  onboardingAnchor,
} from '@/components/interfaces/AI/GuideBubbles/onboarding-anchors'

describe('ActionCard', () => {
  it('forwards rest props (onboarding anchors) onto its root element', () => {
    const { container } = render(
      <ActionCard
        icon={<Table2 />}
        title="Create a table"
        description="Design and create a new database table"
        bgColor="bg-blue-500"
        {...onboardingAnchor(ONBOARDING_ANCHORS.tables.newTableButton)}
      />
    )
    const anchored = container.querySelector(
      `[${ONBOARDING_ATTR}="${ONBOARDING_ANCHORS.tables.newTableButton}"]`
    )
    expect(anchored).not.toBeNull()
    // The anchor must sit on a box-generating element that contains the card
    // content — not a display:contents wrapper (see onboarding-anchors.ts).
    expect(anchored!.textContent).toContain('Create a table')
  })
})
