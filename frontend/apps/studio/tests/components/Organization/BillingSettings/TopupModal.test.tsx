import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockMutate = vi.fn()
const mockIsPending = vi.fn(() => false)

vi.mock('@/data/billing/topup-session-mutation', () => ({
  useCreateTopupSessionMutation: () => ({
    mutate: mockMutate,
    isPending: mockIsPending(),
  }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { TopupModal } from '@/components/interfaces/Organization/BillingSettings/TopupModal'

function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  mockMutate.mockReset()
  mockIsPending.mockReturnValue(false)
})

describe('TopupModal', () => {
  it('Continue button is disabled below $0.50', () => {
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <TopupModal slug="test-org" onClose={() => {}} />
      </Wrapper>
    )
    const input = screen.getByTestId('topup-amount')
    fireEvent.change(input, { target: { value: '0.40' } })
    const continueBtn = screen.getByRole('button', { name: /Continue to checkout/i })
    expect(continueBtn).toBeDisabled()
  })

  it('Continue button is enabled at $10', () => {
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <TopupModal slug="test-org" onClose={() => {}} />
      </Wrapper>
    )
    const input = screen.getByTestId('topup-amount')
    // default is already 10.00
    fireEvent.change(input, { target: { value: '10.00' } })
    const continueBtn = screen.getByRole('button', { name: /Continue to checkout/i })
    expect(continueBtn).not.toBeDisabled()
  })

  it('save-card checkbox defaults checked', () => {
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <TopupModal slug="test-org" onClose={() => {}} />
      </Wrapper>
    )
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
  })

  it('submit calls mutation with { slug, amountCents: 1000, saveCardOnFile: true }', () => {
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <TopupModal slug="test-org" onClose={() => {}} />
      </Wrapper>
    )
    // Default amount is 10.00 → 1000 cents
    const continueBtn = screen.getByRole('button', { name: /Continue to checkout/i })
    fireEvent.click(continueBtn)
    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockMutate.mock.calls[0][0]).toMatchObject({
      slug: 'test-org',
      amountCents: 1000,
      saveCardOnFile: true,
    })
  })
})
