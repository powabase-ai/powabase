import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InfrastructureComputeSection } from '@/components/interfaces/Infrastructure/InfrastructureComputeSection'
import { render } from '@/tests/helpers'

// Billing-UI gate (per-org master switch) — toggled per test.
let billingUiEnabled = true
const mockResize = vi.fn()

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
vi.mock('@/data/billing/resize-compute-mutation', () => ({
  useResizeComputeMutation: () => ({ mutate: mockResize, isPending: false }),
}))

beforeEach(() => {
  billingUiEnabled = true
  mockResize.mockClear()
})

describe('InfrastructureComputeSection', () => {
  it('gates on billing UI: shows the unavailable alert when disabled', () => {
    billingUiEnabled = false
    render(<InfrastructureComputeSection />)
    expect(screen.getByText(/Compute management is unavailable/i)).toBeInTheDocument()
    expect(screen.queryByText('Compute size')).not.toBeInTheDocument()
  })

  it('renders the picker with apply disabled until a different tier is selected', () => {
    render(<InfrastructureComputeSection />)
    expect(screen.getByText('Compute size')).toBeInTheDocument()
    expect(screen.getByText('Current tier')).toBeInTheDocument()
    // No target chosen yet -> the apply button is the disabled placeholder.
    expect(screen.getByRole('button', { name: /Select a new tier/i })).toBeDisabled()
  })

  it('selecting a new tier and confirming resizes to that tier', () => {
    render(<InfrastructureComputeSection />)
    // Pick Workshop (id `small`) — current tier is Builder (`micro`).
    fireEvent.click(screen.getByRole('button', { name: /Workshop/i }))

    const apply = screen.getByRole('button', { name: /^Resize to Workshop$/i })
    expect(apply).toBeEnabled()
    fireEvent.click(apply) // opens the confirm modal

    // Confirm dialog warns about the brief DB restart; scope the confirm click
    // to the dialog so it isn't confused with the apply button of the same name.
    expect(screen.getByText(/restarts the database/i)).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Resize to Workshop/i }))

    expect(mockResize).toHaveBeenCalledWith(
      { ref: 'abc', computeSizeId: 'small' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    )
  })

  it('does not resize when the chosen tier equals the current tier', () => {
    render(<InfrastructureComputeSection />)
    // Selecting the current tier (Builder/`micro`) keeps apply on the disabled placeholder.
    fireEvent.click(screen.getByRole('button', { name: /Builder/i }))
    expect(screen.getByRole('button', { name: /Select a new tier/i })).toBeDisabled()
    expect(mockResize).not.toHaveBeenCalled()
  })

  it('offers an Enterprise contact-sales link', () => {
    render(<InfrastructureComputeSection />)
    expect(screen.getByRole('link', { name: /Contact sales/i })).toBeInTheDocument()
  })
})
