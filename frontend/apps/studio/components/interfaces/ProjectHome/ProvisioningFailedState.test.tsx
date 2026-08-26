import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockProject, mockMutate, mockToastError, mockCan } = vi.hoisted(() => ({
  mockProject: { current: {} as any },
  mockMutate: vi.fn(),
  mockToastError: vi.fn(),
  mockCan: { current: true },
}))

vi.mock('common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('common')>()),
  useParams: () => ({ ref: 'abc' }),
}))
vi.mock('sonner', () => ({ toast: { error: mockToastError } }))
vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject.current }),
}))
vi.mock('@/hooks/misc/useCheckPermissions', () => ({
  useAsyncCheckPermissions: () => ({ can: mockCan.current, isLoading: false }),
}))
vi.mock('@/data/projects/project-provisioning-retry-mutation', () => ({
  ProvisioningRetryError: class extends Error {
    constructor(
      message: string,
      public code: number
    ) {
      super(message)
    }
  },
  useProjectProvisioningRetryMutation: () => ({ mutate: mockMutate, isPending: false }),
}))
vi.mock('@/components/interfaces/Settings/General/DeleteProjectPanel/DeleteProjectButton', () => ({
  DeleteProjectButton: ({ type }: { type?: string }) => (
    <button data-testid="delete-project-button" data-type={type}>
      Delete project
    </button>
  ),
}))
vi.mock('@/components/interfaces/Support/SupportLink', () => ({
  SupportLink: ({ children }: any) => <a>{children}</a>,
}))
vi.mock('@/components/ui/ButtonTooltip', () => ({
  ButtonTooltip: ({ children, onClick, disabled, tooltip }: any) => (
    <button onClick={onClick} disabled={disabled} title={tooltip?.content?.text}>
      {children}
    </button>
  ),
}))
vi.mock('ui', () => ({
  Alert_Shadcn_: ({ children }: any) => <div role="alert">{children}</div>,
  AlertDescription_Shadcn_: ({ children }: any) => <div>{children}</div>,
  AlertTitle_Shadcn_: ({ children }: any) => <h2>{children}</h2>,
  CriticalIcon: () => null,
}))

import { ProvisioningFailedState } from './ProvisioningFailedState'

const failed = {
  status: 'failed',
  step: 'step-3',
  failed_step: 'step-3',
  phase: 'services',
  error: 'The services did not become ready in time.',
  attempts: 1,
  retryable: true,
  updated_at: null,
}

describe('ProvisioningFailedState', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockToastError.mockReset()
    mockCan.current = true
    mockProject.current = {
      id: 'p-1',
      ref: 'abc',
      name: 'demo',
      status: 'INIT_FAILED',
      provisioning: failed,
    }
  })

  it('names the failed phase and shows the safe error string', () => {
    render(<ProvisioningFailedState />)
    expect(screen.getByText('Setup failed while starting services')).toBeInTheDocument()
    expect(screen.getByTestId('provisioning-error')).toHaveTextContent(
      'The services did not become ready in time.'
    )
  })

  it('retries the set-up when the platform marks it retryable and the member may update the project', () => {
    render(<ProvisioningFailedState />)
    fireEvent.click(screen.getByText('Retry setup'))
    expect(mockMutate).toHaveBeenCalledWith({ ref: 'abc' }, expect.anything())
  })

  it('offers no retry when the platform does not mark the attempt retryable', () => {
    mockProject.current = {
      ...mockProject.current,
      provisioning: { ...failed, retryable: false },
    }
    render(<ProvisioningFailedState />)
    expect(screen.getByText('Retry setup')).toBeDisabled()
    expect(screen.getByText(/cannot be retried/)).toBeInTheDocument()
  })

  it('disables Retry, with the permission tooltip, for a member who may not update the project', () => {
    mockCan.current = false
    render(<ProvisioningFailedState />)
    const retry = screen.getByText('Retry setup')
    expect(retry).toBeDisabled()
    expect(retry).toHaveAttribute('title', expect.stringMatching(/additional permissions/))
  })

  it('stays silent on a 409 — the refetch already shows the real state — and toasts other failures', () => {
    render(<ProvisioningFailedState />)
    fireEvent.click(screen.getByText('Retry setup'))
    const { onError } = mockMutate.mock.calls[0][1]
    onError(Object.assign(new Error('not_retryable'), { code: 409 }))
    expect(mockToastError).not.toHaveBeenCalled()
    onError(Object.assign(new Error('retry failed: 500'), { code: 500 }))
    expect(mockToastError).toHaveBeenCalledTimes(1)
  })

  it('shows the title alone when the platform reports no error string', () => {
    mockProject.current = {
      ...mockProject.current,
      provisioning: { ...failed, error: null },
    }
    render(<ProvisioningFailedState />)
    expect(screen.queryByTestId('provisioning-error')).toBeNull()
    expect(screen.getByText('Setup failed while starting services')).toBeInTheDocument()
  })

  it('offers the permission-gated delete button', () => {
    render(<ProvisioningFailedState />)
    expect(screen.getByTestId('delete-project-button')).toHaveAttribute('data-type', 'default')
  })
})
