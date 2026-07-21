import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ManageSubscriptionPanel } from '@/components/interfaces/Organization/BillingSettings/PowabasePlanPicker/ManageSubscriptionPanel'

const mockMutate = vi.fn()
vi.mock('@/data/billing/portal-session-mutation', () => ({
  useCreatePortalSessionMutation: () => ({ mutate: mockMutate, isPending: false }),
}))

// The panel now reads the query client (to refresh the subscription when the
// user returns from the Customer Portal), so renders need a provider.
const renderWithClient = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  )

beforeEach(() => {
  mockMutate.mockClear()
})

const SELF_SERVE_SUB = {
  plan: { id: 'self-serve', name: 'Self-Serve' },
  current_period_end: 1759363200, // 2025-10-01 UTC
}

describe('ManageSubscriptionPanel', () => {
  it('renders current plan name', () => {
    renderWithClient(<ManageSubscriptionPanel slug="org" subscription={SELF_SERVE_SUB} />)
    expect(screen.getByText(/Self-Serve/)).toBeInTheDocument()
  })

  it('renders renews-on date from current_period_end (Unix seconds)', () => {
    renderWithClient(<ManageSubscriptionPanel slug="org" subscription={SELF_SERVE_SUB} />)
    // toLocaleDateString output varies by locale; assert "Renews on:" prefix at minimum
    expect(screen.getByText(/Renews on:/)).toBeInTheDocument()
    // The date must NOT be "N/A" since current_period_end > 0
    expect(screen.queryByText('N/A')).toBeNull()
  })

  it('renders N/A when current_period_end is null', () => {
    const sub = { plan: { id: 'self-serve', name: 'Self-Serve' }, current_period_end: null }
    renderWithClient(<ManageSubscriptionPanel slug="org" subscription={sub} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('renders N/A when current_period_end is 0', () => {
    const sub = { plan: { id: 'self-serve', name: 'Self-Serve' }, current_period_end: 0 }
    renderWithClient(<ManageSubscriptionPanel slug="org" subscription={sub} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('calls portal-session mutation on Manage subscription click', () => {
    renderWithClient(<ManageSubscriptionPanel slug="my-org" subscription={SELF_SERVE_SUB} />)
    fireEvent.click(screen.getByRole('button', { name: /Manage subscription/i }))
    // PR #499 R1 #5b: mutate now receives a second `options` arg with onError.
    expect(mockMutate).toHaveBeenCalled()
    const [vars, options] = mockMutate.mock.calls[0]
    expect(vars).toEqual({ slug: 'my-org' })
    expect(typeof options?.onError).toBe('function')
  })

  it('renders the customer portal disclosure copy', () => {
    renderWithClient(<ManageSubscriptionPanel slug="org" subscription={SELF_SERVE_SUB} />)
    expect(screen.getByText(/Customer Portal/)).toBeInTheDocument()
  })
})
