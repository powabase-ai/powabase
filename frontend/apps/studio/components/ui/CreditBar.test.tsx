import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { render } from '@/tests/helpers'

const { mockUseCreditsLimitsQuery, mockUseIsFeatureEnabled, mockUseSelectedOrganizationQuery } =
  vi.hoisted(() => ({
    mockUseCreditsLimitsQuery: vi.fn(),
    mockUseIsFeatureEnabled: vi.fn(() => true),
    mockUseSelectedOrganizationQuery: vi.fn(() => ({ data: { slug: 'test-org' } })),
  }))

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/data/credits/limits-query', () => ({
  useCreditsLimitsQuery: mockUseCreditsLimitsQuery,
}))

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: mockUseIsFeatureEnabled,
}))

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: mockUseSelectedOrganizationQuery,
}))

import { CreditBar } from './CreditBar'

// renews_at far enough in the future that daysFromNow() returns >0 and the
// component renders the success path rather than the error fallback.
const FUTURE_ISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

function setLimits(balance: number, monthlyCredits: number, planId = 'free') {
  mockUseCreditsLimitsQuery.mockReturnValue({
    data: {
      org_id: 'org-1',
      plan_id: planId,
      monthly_credits: monthlyCredits,
      balance,
      renews_at: FUTURE_ISO,
    },
    isError: false,
  })
}

describe('CreditBar — free plan (one-time, non-refilling credit)', () => {
  // Free credit is a one-time grant that carries over (migration 0014), so the
  // bar shows the balance alone — no monthly cap, no "this month", no reset.
  it('renders balance only, formatted from millicents', () => {
    setLimits(2_000_000, 0, 'free')
    render(<CreditBar />)
    const bar = screen.getByTestId('credit-bar')
    expect(bar).toHaveTextContent('$20.00')
    expect(bar).not.toHaveTextContent('this month')
    expect(bar).not.toHaveTextContent('of $')
  })

  it('shows balance only after the grant is partly spent', () => {
    setLimits(350_000, 0, 'free')
    render(<CreditBar />)
    const bar = screen.getByTestId('credit-bar')
    expect(bar).toHaveTextContent('$3.50')
    expect(bar).not.toHaveTextContent('this month')
  })

  it('renders a zero balance as "$0.00" with no reset wording', () => {
    setLimits(0, 0, 'free')
    render(<CreditBar />)
    const bar = screen.getByTestId('credit-bar')
    expect(bar).toHaveTextContent('$0.00')
    expect(bar).not.toHaveTextContent('this month')
  })
})

describe('CreditBar — paid plan (monthly allowance, refills)', () => {
  // Paid plans keep the monthly cap + reset framing.
  it('renders "$X of $Y this month" with the cap', () => {
    setLimits(350_000, 500_000, 'pro')
    render(<CreditBar />)
    const bar = screen.getByTestId('credit-bar')
    expect(bar).toHaveTextContent('$3.50 of $5.00 this month')
  })

  it('renders negative balance with leading minus', () => {
    setLimits(-100_000, 500_000, 'pro')
    render(<CreditBar />)
    const bar = screen.getByTestId('credit-bar')
    expect(bar).toHaveTextContent('-$1.00 of $5.00 this month')
  })
})

describe('CreditBar — gate keys on capability (monthly_credits), not plan name', () => {
  // Single source of truth: rendering follows whether the plan actually refills
  // (monthly_credits > 0), so this header and the usage page can't disagree when
  // plan_id and monthly_credits diverge (an unknown/zero-allowance plan, or a
  // hypothetical free-with-allowance promo).
  it('shows balance only for a non-free plan with no allowance (monthly_credits=0)', () => {
    setLimits(2_000_000, 0, 'pro')
    render(<CreditBar />)
    const bar = screen.getByTestId('credit-bar')
    expect(bar).toHaveTextContent('$20.00')
    expect(bar).not.toHaveTextContent('this month')
    expect(bar).not.toHaveTextContent('of $')
  })

  it('shows the cap + "this month" for a free plan that has an allowance (monthly_credits>0)', () => {
    setLimits(350_000, 500_000, 'free')
    render(<CreditBar />)
    const bar = screen.getByTestId('credit-bar')
    expect(bar).toHaveTextContent('$3.50 of $5.00 this month')
  })
})
