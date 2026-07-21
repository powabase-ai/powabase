import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { ProjectHome } from '@/components/interfaces/ProjectHome/Home'
import { render } from '@/tests/helpers'

// Verifies that the B5 paused-project banner renders when project.state === 'paused'
// and is absent when the project is active. Targets the IS_PLATFORM=true variant
// (ProjectHome) — the IS_PLATFORM=false variant (Home) is covered by the same logic
// but a separate render path.

let billingUiEnabled = true
vi.mock('@/hooks/misc/useIsBillingUiEnabled', () => ({
  useIsBillingUiEnabled: () => billingUiEnabled,
}))

let projectData: Record<string, unknown> = {
  ref: 'abc',
  name: 'proj',
  status: 'ACTIVE_HEALTHY',
  state: 'paused',
  pause_cause: 'auto_grace_exhausted',
  compute_size_id: 'micro',
}

vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: projectData }),
}))

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({
    data: { id: 'org-1', slug: 'org-1', name: 'Org', plan: { id: 'free', name: 'Free' } },
  }),
}))

vi.mock('@/components/interfaces/ProjectHome/OverviewStats', () => ({
  OverviewStats: () => null,
}))

vi.mock('@/data/projects/project-resume-mutation', () => ({
  useProjectResumeMutation: () => ({ isLoading: false, mutate: vi.fn() }),
}))

test('shows the paused banner when project.state is paused', () => {
  billingUiEnabled = true
  projectData = {
    ref: 'abc',
    name: 'proj',
    status: 'ACTIVE_HEALTHY',
    state: 'paused',
    pause_cause: 'auto_grace_exhausted',
    compute_size_id: 'micro',
  }
  render(<ProjectHome />)
  expect(screen.getByText('This project is paused')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /resume project/i })).toBeInTheDocument()
})

test('paused banner absent when project.state is not paused', () => {
  billingUiEnabled = true
  projectData = {
    ref: 'abc',
    name: 'proj',
    status: 'ACTIVE_HEALTHY',
    state: 'active',
    compute_size_id: 'micro',
  }
  render(<ProjectHome />)
  expect(screen.queryByText('This project is paused')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /resume project/i })).not.toBeInTheDocument()
})

test('paused banner absent when billing UI is disabled', () => {
  billingUiEnabled = false
  projectData = {
    ref: 'abc',
    name: 'proj',
    status: 'ACTIVE_HEALTHY',
    state: 'paused',
    pause_cause: 'auto_grace_exhausted',
    compute_size_id: 'micro',
  }
  render(<ProjectHome />)
  expect(screen.queryByText('This project is paused')).not.toBeInTheDocument()
})
