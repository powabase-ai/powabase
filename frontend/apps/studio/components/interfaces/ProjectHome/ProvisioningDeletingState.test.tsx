import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockProject } = vi.hoisted(() => ({ mockProject: { current: {} as any } }))

vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: mockProject.current }),
}))

import { ProvisioningDeletingState } from './ProvisioningDeletingState'

describe('ProvisioningDeletingState', () => {
  it('names the project and says it is on its way out', () => {
    mockProject.current = { ref: 'abc', name: 'demo', status: 'GOING_DOWN', provisioning: null }
    render(<ProvisioningDeletingState />)
    expect(screen.getByTestId('provisioning-deleting-state')).toBeInTheDocument()
    expect(screen.getByText('demo')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('being deleted')
  })
})
