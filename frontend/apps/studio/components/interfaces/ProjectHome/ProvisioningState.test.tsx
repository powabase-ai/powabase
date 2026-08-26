import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockProject } = vi.hoisted(() => ({ mockProject: { current: {} as any } }))

vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject.current }),
}))
// The settings page's permission-gated delete button; its own behaviour is its own.
vi.mock('@/components/interfaces/Settings/General/DeleteProjectPanel/DeleteProjectButton', () => ({
  DeleteProjectButton: ({ type }: { type?: string }) => (
    <button data-testid="delete-project-button" data-type={type}>
      Delete project
    </button>
  ),
}))
vi.mock('ui', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}))

import { ProvisioningState } from './ProvisioningState'

const rows = () =>
  Array.from(document.querySelectorAll('[data-phase]')).map((el) => [
    el.getAttribute('data-phase'),
    el.getAttribute('data-state'),
    el.getAttribute('aria-current'),
  ])

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

describe('ProvisioningState', () => {
  it('renders the live phase with earlier phases done and later ones pending', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'COMING_UP', provisioning: running }
    render(<ProvisioningState />)
    expect(screen.getByTestId('provisioning-state')).toBeInTheDocument()
    expect(screen.getAllByText('Setting up the database').length).toBeGreaterThan(0)
    expect(rows()).toEqual([
      ['credentials', 'done', null],
      ['environment', 'done', null],
      ['database', 'current', 'step'],
      ['services', 'pending', null],
      ['verifying', 'pending', null],
    ])
  })

  it('renders every phase pending before the first phase is reported', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'COMING_UP', provisioning: null }
    render(<ProvisioningState />)
    expect(screen.getAllByText('Setting up project').length).toBeGreaterThan(0)
    expect(rows().every(([, state]) => state === 'pending')).toBe(true)
  })

  it('offers the permission-gated delete button', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'COMING_UP', provisioning: running }
    render(<ProvisioningState />)
    expect(screen.getByTestId('delete-project-button')).toHaveAttribute('data-type', 'default')
  })

  it('says so when the platform cannot be reached', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'COMING_UP', provisioning: running }
    render(<ProvisioningState degraded />)
    expect(screen.getByTestId('provisioning-degraded')).toBeInTheDocument()
  })
})
