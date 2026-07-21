import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockToastSuccess, mockToastInfo, mockUseRouter } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastInfo: vi.fn(),
  mockUseRouter: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: mockToastSuccess, info: mockToastInfo } }))
vi.mock('next/router', () => ({ useRouter: () => mockUseRouter() }))

import { CheckoutResultBanner } from '@/components/interfaces/Organization/BillingSettings/PowabasePlanPicker/CheckoutResultBanner'
import { organizationKeys } from '@/data/organizations/keys'

function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  mockToastSuccess.mockClear()
  mockToastInfo.mockClear()
})

describe('CheckoutResultBanner', () => {
  it('shows success toast and invalidates queries on ?checkout=success', () => {
    mockUseRouter.mockReturnValue({ query: { checkout: 'success', slug: 'test-org' } })
    const client = new QueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const Wrapper = wrap(client)
    render(<Wrapper><CheckoutResultBanner /></Wrapper>)
    expect(mockToastSuccess).toHaveBeenCalledTimes(1)
    expect(mockToastSuccess.mock.calls[0][0]).toMatch(/Subscription activated/)

    // Advance 5s — should invalidate 5 times
    vi.advanceTimersByTime(5000)
    expect(invalidateSpy.mock.calls.length).toBeGreaterThanOrEqual(5)
    // Polling stopped after 5s
    vi.advanceTimersByTime(5000)
    const callsAtTen = invalidateSpy.mock.calls.length
    vi.advanceTimersByTime(5000)
    expect(invalidateSpy.mock.calls.length).toBe(callsAtTen)
  })

  it('invalidates the canonical credits limits key, not the stale wallet or balance keys', () => {
    // PR #499 R1 #5c + R2 B3: previous rounds invalidated keys with no
    // subscriber.
    //   - R0: `['billing', 'wallet', slug]` — no factory in the codebase
    //   - R1: `creditsKeys.balance(slug)` — `useCreditsBalanceQuery` was
    //     removed in 2026-05 cleanup (see data/credits/balance-query.ts:30-32)
    // The live subscriber is `useCreditsLimitsQuery`, mounted globally via
    // `<CreditBar />` inside `<LayoutHeader />`. Use `creditsKeys.limits(slug)`.
    //
    // Counterfactual: revert the file to use `creditsKeys.balance(slug)` ->
    // hasCreditsLimits is false. Revert to `['billing', 'wallet', slug]` ->
    // hasCreditsLimits is also false and hasOldWallet is true.
    mockUseRouter.mockReturnValue({ query: { checkout: 'success', slug: 'test-org' } })
    const client = new QueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const Wrapper = wrap(client)
    render(<Wrapper><CheckoutResultBanner /></Wrapper>)

    // Trigger at least one polling tick.
    vi.advanceTimersByTime(1000)

    const allKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    const hasCreditsLimits = allKeys.some(
      (k) => Array.isArray(k) && k[0] === 'credits' && k[1] === 'limits' && k[2] === 'test-org'
    )
    const hasOldCreditsBalance = allKeys.some(
      (k) => Array.isArray(k) && k[0] === 'credits' && k[1] === 'balance'
    )
    const hasOldWallet = allKeys.some(
      (k) => Array.isArray(k) && k[0] === 'billing' && k[1] === 'wallet'
    )
    expect(hasCreditsLimits).toBe(true)
    expect(hasOldCreditsBalance).toBe(false)
    expect(hasOldWallet).toBe(false)
    // org.plan.id (plan-card highlight + project-creation compute rates) lives in
    // the long-staleTime organizations list and must refresh after a plan change.
    // Counterfactual: drop the organizationKeys.list() invalidation -> this fails.
    const hasOrgList = allKeys.some(
      (k) => JSON.stringify(k) === JSON.stringify(organizationKeys.list())
    )
    expect(hasOrgList).toBe(true)
  })

  it('shows info toast on ?checkout=cancel (no polling)', () => {
    mockUseRouter.mockReturnValue({ query: { checkout: 'cancel', slug: 'test-org' } })
    const client = new QueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const Wrapper = wrap(client)
    render(<Wrapper><CheckoutResultBanner /></Wrapper>)
    expect(mockToastInfo).toHaveBeenCalledTimes(1)
    expect(mockToastInfo.mock.calls[0][0]).toMatch(/Checkout canceled/)
    vi.advanceTimersByTime(5000)
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('renders null and no-ops without checkout query param', () => {
    mockUseRouter.mockReturnValue({ query: { slug: 'test-org' } })
    const client = new QueryClient()
    const Wrapper = wrap(client)
    const { container } = render(<Wrapper><CheckoutResultBanner /></Wrapper>)
    expect(container.firstChild).toBeNull()
    expect(mockToastSuccess).not.toHaveBeenCalled()
    expect(mockToastInfo).not.toHaveBeenCalled()
  })
})
