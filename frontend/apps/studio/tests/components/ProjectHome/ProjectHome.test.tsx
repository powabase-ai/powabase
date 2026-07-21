import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { ProjectHome } from '@/components/interfaces/ProjectHome/Home'
import { render } from '@/tests/helpers'

// ProjectHome is the IS_PLATFORM=true project overview (pages/project/[ref]
// renders it in the Docker/prod build). The compute-tier badge + resize entry
// must live HERE, not only in the IS_PLATFORM=false `interfaces/Home/Home`
// variant — that split is exactly how the badge shipped invisible on :3001.

let billingUiEnabled = true
vi.mock('@/hooks/misc/useIsBillingUiEnabled', () => ({
  useIsBillingUiEnabled: () => billingUiEnabled,
}))

vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({
    data: { ref: 'abc', name: 'proj', status: 'ACTIVE_HEALTHY', compute_size_id: 'micro' },
  }),
}))

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({
    data: { id: 'org-1', slug: 'org-1', name: 'Org', plan: { id: 'free', name: 'Free' } },
  }),
}))

// Covered by their own suites; stubbed to keep this test on the gating logic.
vi.mock('@/components/interfaces/ProjectHome/OverviewStats', () => ({
  OverviewStats: () => null,
}))

// Resize moved to the dedicated Infrastructure tab: the overview now shows a
// "Manage compute" link (Button asChild -> <Link>, role=link) instead of the
// old inline "Resize compute" button that popped a modal.
test('billing UI enabled: shows the tier badge and Manage compute link', () => {
  billingUiEnabled = true
  render(<ProjectHome />)
  expect(screen.getByText('Builder')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /manage compute/i })).toBeInTheDocument()
})

test('billing UI disabled: no badge, no manage-compute link', () => {
  billingUiEnabled = false
  render(<ProjectHome />)
  expect(screen.queryByText('Builder')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /manage compute/i })).not.toBeInTheDocument()
})
