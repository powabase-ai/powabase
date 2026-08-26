import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockProject, mockSync } = vi.hoisted(() => ({
  mockProject: { current: {} as any },
  mockSync: vi.fn(() => ({ isPollError: false })),
}))

vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject.current }),
}))
vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: { name: 'Org', slug: 'org' } }),
}))
vi.mock('@/hooks/misc/useIsBillingUiEnabled', () => ({ useIsBillingUiEnabled: () => false }))
vi.mock('@/hooks/misc/useProvisioningStatusSync', () => ({
  useProvisioningStatusSync: mockSync,
}))
vi.mock('@/data/projects/project-resume-mutation', () => ({
  useProjectResumeMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/components/layouts/Scaffold', () => ({
  ScaffoldContainer: ({ children }: any) => <div>{children}</div>,
  ScaffoldSection: ({ children }: any) => <div>{children}</div>,
}))
vi.mock('ui', () => ({
  Alert_Shadcn_: ({ children }: any) => <div>{children}</div>,
  AlertDescription_Shadcn_: ({ children }: any) => <div>{children}</div>,
  AlertTitle_Shadcn_: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Button: ({ children }: any) => <button>{children}</button>,
  WarningIcon: () => null,
}))
vi.mock('./OverviewStats', () => ({
  OverviewStats: () => <div data-testid="overview-stats" />,
}))
vi.mock('./ProvisioningState', () => ({
  ProvisioningState: () => <div data-testid="provisioning-state" />,
}))
vi.mock('./ProvisioningFailedState', () => ({
  ProvisioningFailedState: () => <div data-testid="provisioning-failed-state" />,
}))
vi.mock('./ProvisioningDeletingState', () => ({
  ProvisioningDeletingState: () => <div data-testid="provisioning-deleting-state" />,
}))

import { ProjectHome } from './Home'

const running = {
  status: 'running',
  step: 'migrate',
  failed_step: null,
  phase: 'database',
  error: null,
  attempts: 1,
  retryable: false,
  updated_at: null,
}

describe('ProjectHome surfaces', () => {
  it('renders the building surface — and mounts no overview queries — while COMING_UP', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'COMING_UP', provisioning: running }
    render(<ProjectHome />)
    expect(screen.getByTestId('provisioning-state')).toBeInTheDocument()
    expect(screen.queryByTestId('overview-stats')).toBeNull()
  })

  it('renders the normal home once ACTIVE_HEALTHY', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'ACTIVE_HEALTHY', provisioning: null }
    render(<ProjectHome />)
    expect(screen.getByTestId('overview-stats')).toBeInTheDocument()
    expect(screen.queryByTestId('provisioning-state')).toBeNull()
  })

  it('mounts the cache sync: polling only while not normal, list reconciliation for any project with provisioning history', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'COMING_UP', provisioning: running }
    render(<ProjectHome />)
    expect(mockSync).toHaveBeenLastCalledWith('abc', 'COMING_UP', true, true)

    mockProject.current = {
      ref: 'abc',
      name: 'demo',
      status: 'ACTIVE_HEALTHY',
      provisioning: { ...running, status: 'succeeded', phase: 'verifying' },
    }
    render(<ProjectHome />)
    expect(mockSync).toHaveBeenLastCalledWith('abc', 'ACTIVE_HEALTHY', false, true)

    // Flag-off and legacy rows: nothing to poll, nothing to reconcile.
    mockProject.current = { ref: 'abc', name: 'demo', status: 'ACTIVE_HEALTHY', provisioning: null }
    render(<ProjectHome />)
    expect(mockSync).toHaveBeenLastCalledWith('abc', 'ACTIVE_HEALTHY', false, false)
  })

  it('renders the failed surface while INIT_FAILED and the deleting surface while GOING_DOWN', () => {
    mockProject.current = {
      ref: 'abc',
      name: 'demo',
      status: 'INIT_FAILED',
      provisioning: { ...running, status: 'failed', failed_step: 'step-3', retryable: true },
    }
    const { rerender } = render(<ProjectHome />)
    expect(screen.getByTestId('provisioning-failed-state')).toBeInTheDocument()
    expect(screen.queryByTestId('overview-stats')).toBeNull()

    mockProject.current = { ref: 'abc', name: 'demo', status: 'GOING_DOWN', provisioning: running }
    rerender(<ProjectHome />)
    expect(screen.getByTestId('provisioning-deleting-state')).toBeInTheDocument()
  })

  it('moves building → failed → building → normal as the status changes, without remounting', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'COMING_UP', provisioning: running }
    const { rerender } = render(<ProjectHome />)
    expect(screen.getByTestId('provisioning-state')).toBeInTheDocument()

    mockProject.current = {
      ...mockProject.current,
      status: 'INIT_FAILED',
      provisioning: { ...running, status: 'failed', retryable: true },
    }
    rerender(<ProjectHome />)
    expect(screen.getByTestId('provisioning-failed-state')).toBeInTheDocument()

    mockProject.current = { ...mockProject.current, status: 'COMING_UP', provisioning: running }
    rerender(<ProjectHome />)
    expect(screen.getByTestId('provisioning-state')).toBeInTheDocument()

    mockProject.current = { ...mockProject.current, status: 'ACTIVE_HEALTHY', provisioning: null }
    rerender(<ProjectHome />)
    expect(screen.getByTestId('overview-stats')).toBeInTheDocument()
    expect(screen.queryByTestId('provisioning-state')).toBeNull()
  })
})
