import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from 'ui'

const mockUseIsFeatureEnabled = vi.fn()
vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: (keys: string[]) => mockUseIsFeatureEnabled(keys),
}))

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({
    data: { slug: 'my-org', plan: { id: 'self-serve', name: 'Self-Serve' } },
  }),
}))

vi.mock('@/data/subscriptions/org-subscription-query', () => ({
  useOrgSubscriptionQuery: () => ({
    data: {
      billing_via_partner: false,
      plan: { id: 'self-serve', name: 'Self-Serve' },
      current_period_end: 1759363200,
    },
  }),
}))

vi.mock('next/router', () => ({ useRouter: () => ({ query: {} }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn() } }))

vi.mock('@/components/interfaces/Organization/BillingSettings/WalletPanel', () => ({
  WalletPanel: () => <div data-testid="wallet-panel" />,
}))
vi.mock('@/components/interfaces/Organization/BillingSettings/PowabasePlanPicker/PowabasePlanCards', () => ({
  PowabasePlanCards: () => <div data-testid="plan-cards" />,
}))
vi.mock('@/components/interfaces/Organization/BillingSettings/ComputePricingPanel', () => ({
  ComputePricingPanel: () => <div data-testid="compute-panel" />,
}))
vi.mock('@/components/interfaces/Organization/BillingSettings/PowabasePlanPicker/CheckoutResultBanner', () => ({
  CheckoutResultBanner: () => null,
}))

import { BillingSettings } from '@/components/interfaces/Organization/BillingSettings/BillingSettings'

function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}

describe('BillingSettings (B1 wiring)', () => {
  beforeEach(() => mockUseIsFeatureEnabled.mockReset())

  it('renders bespoke BYOC Alert fallback when billing:all=false', () => {
    mockUseIsFeatureEnabled.mockReturnValue({
      billingAll: false,
      billingPlanPicker: false,
      billingAccountData: false,
      billingPaymentMethods: false,
      billingCredits: false,
      billingInvoices: false,
    })
    const Wrapper = wrap(new QueryClient())
    render(<Wrapper><BillingSettings /></Wrapper>)
    // B#6 fix: assert the bespoke Alert title text directly, NOT a generic
    // /Billing/ match (which passes via the ScaffoldTitle even when the
    // alert renders null — that's how the prior PartnerManagedResource
    // version of this test green-passed against a broken component).
    expect(
      screen.getByText(/Billing is managed by your operator/i)
    ).toBeInTheDocument()
  })

  it('renders ManageSubscriptionPanel for paid orgs when billing:all=true and billing:plan_picker=true', () => {
    mockUseIsFeatureEnabled.mockReturnValue({
      billingAll: true,
      billingPlanPicker: true,
      billingAccountData: true,
      billingPaymentMethods: true,
      billingCredits: true,
      billingInvoices: true,
    })
    const Wrapper = wrap(new QueryClient())
    render(<Wrapper><BillingSettings /></Wrapper>)
    expect(screen.getByText(/Subscription/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Manage subscription/i })).toBeInTheDocument()
  })

  it('does NOT render plan picker components when billing:plan_picker=false', () => {
    mockUseIsFeatureEnabled.mockReturnValue({
      billingAll: true,
      billingPlanPicker: false,
      billingAccountData: true,
      billingPaymentMethods: true,
      billingCredits: true,
      billingInvoices: true,
    })
    const Wrapper = wrap(new QueryClient())
    render(<Wrapper><BillingSettings /></Wrapper>)
    expect(screen.queryByRole('button', { name: /Manage subscription/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('upgrade-plan-picker')).not.toBeInTheDocument()
    // The Billing page title should still be visible
    expect(screen.getByText('Billing')).toBeInTheDocument()
  })

  it('renders the Powabase plan cards + compute panel when billing:plan_picker=true', () => {
    mockUseIsFeatureEnabled.mockReturnValue({
      billingAll: true,
      billingPlanPicker: true,
      billingAccountData: true,
      billingPaymentMethods: true,
      billingCredits: true,
      billingInvoices: true,
    })
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <BillingSettings />
      </Wrapper>
    )
    expect(screen.getByTestId('wallet-panel')).toBeInTheDocument()
    expect(screen.getByTestId('plan-cards')).toBeInTheDocument()
    expect(screen.getByTestId('compute-panel')).toBeInTheDocument()
  })
})
