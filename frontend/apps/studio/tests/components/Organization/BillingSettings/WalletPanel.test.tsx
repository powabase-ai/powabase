import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock wallet query — controlled per-test
const mockUseOrgWalletQuery = vi.fn()
vi.mock('@/data/billing/wallet-query', () => ({
  useOrgWalletQuery: (slug: string) => mockUseOrgWalletQuery(slug),
}))

// Mock child components to isolate WalletPanel
vi.mock(
  '@/components/interfaces/Organization/BillingSettings/PaymentMethodsPanel',
  () => ({
    PaymentMethodsPanel: ({ slug, cardOnFile }: { slug: string; cardOnFile: boolean }) => (
      <div data-testid="payment-methods-panel" data-slug={slug} data-card={String(cardOnFile)} />
    ),
  })
)
vi.mock(
  '@/components/interfaces/Organization/BillingSettings/SpendCapEditor',
  () => ({
    SpendCapEditor: ({ slug }: { slug: string }) => (
      <div data-testid="spend-cap-editor" data-slug={slug} />
    ),
  })
)
vi.mock(
  '@/components/interfaces/Organization/BillingSettings/TopupModal',
  () => ({
    TopupModal: ({ onClose }: { onClose: () => void }) => (
      <div data-testid="topup-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ),
  })
)

import { WalletPanel } from '@/components/interfaces/Organization/BillingSettings/WalletPanel'

function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const baseWallet = {
  balance_millicents: 0,
  cycle_spent_millicents: 0,
  cycle_start: '2026-06-01T00:00:00Z',
  monthly_max_spend_millicents: 50_000_000,
  cap_set: false,
  card_on_file: false,
  default_payment_method_set: false,
  plan_id: 'free',
  is_paid: false,
  monthly_grant_millicents: 0,
  renews_at: null,
}

beforeEach(() => {
  mockUseOrgWalletQuery.mockReset()
})

describe('WalletPanel', () => {
  it('renders balance $12.35 when balance_millicents=1_234_567', () => {
    mockUseOrgWalletQuery.mockReturnValue({
      data: { ...baseWallet, balance_millicents: 1_234_567 },
      isLoading: false,
    })
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <WalletPanel slug="test-org" />
      </Wrapper>
    )
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('$12.35')
  })

  it('renders "Spent this cycle" from cycle_spent_millicents=17_400 and cap', () => {
    mockUseOrgWalletQuery.mockReturnValue({
      data: {
        ...baseWallet,
        balance_millicents: 5_000_000,
        cycle_spent_millicents: 17_400,
        monthly_max_spend_millicents: 50_000_000,
      },
      isLoading: false,
    })
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <WalletPanel slug="test-org" />
      </Wrapper>
    )
    // $0.17 spent, $500.00 cap
    expect(screen.getByTestId('wallet-panel')).toHaveTextContent('$0.17')
    expect(screen.getByTestId('wallet-panel')).toHaveTextContent('$500.00')
  })

  it('shows low-balance warning banner when balance <= 10% of monthly_grant_millicents', () => {
    // 10_000 balance, 200_000 monthly_grant => 5% => low
    mockUseOrgWalletQuery.mockReturnValue({
      data: {
        ...baseWallet,
        balance_millicents: 10_000,
        monthly_grant_millicents: 200_000,
      },
      isLoading: false,
    })
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <WalletPanel slug="test-org" />
      </Wrapper>
    )
    expect(screen.getByText(/Credit balance is low/i)).toBeInTheDocument()
  })

  it('shows cap warning banner when cycle_spent >= 80% of monthly_max_spend', () => {
    // 40_000_000 spent, 50_000_000 cap => 80%
    mockUseOrgWalletQuery.mockReturnValue({
      data: {
        ...baseWallet,
        balance_millicents: 5_000_000,
        cycle_spent_millicents: 40_000_000,
        monthly_max_spend_millicents: 50_000_000,
      },
      isLoading: false,
    })
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <WalletPanel slug="test-org" />
      </Wrapper>
    )
    expect(screen.getByText(/Approaching your monthly spending cap/i)).toBeInTheDocument()
  })

  it('"Add credits" button opens TopupModal', () => {
    mockUseOrgWalletQuery.mockReturnValue({
      data: { ...baseWallet, balance_millicents: 1_000_000 },
      isLoading: false,
    })
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <WalletPanel slug="test-org" />
      </Wrapper>
    )
    expect(screen.queryByTestId('topup-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add credits/i }))
    expect(screen.getByTestId('topup-modal')).toBeInTheDocument()
  })
})
