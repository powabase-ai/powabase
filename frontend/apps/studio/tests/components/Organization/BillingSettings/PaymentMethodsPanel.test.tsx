import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockAddCardMutate = vi.fn()
const mockPortalMutate = vi.fn()

vi.mock('@/data/billing/payment-method-session-mutation', () => ({
  useCreatePaymentMethodSessionMutation: () => ({
    mutate: mockAddCardMutate,
    isPending: false,
  }),
}))

vi.mock('@/data/billing/portal-session-mutation', () => ({
  useCreatePortalSessionMutation: () => ({
    mutate: mockPortalMutate,
    isPending: false,
  }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PaymentMethodsPanel } from '@/components/interfaces/Organization/BillingSettings/PaymentMethodsPanel'

function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  mockAddCardMutate.mockReset()
  mockPortalMutate.mockReset()
})

describe('PaymentMethodsPanel', () => {
  it('card_on_file=false: renders "No card on file" + "Add card" button calling addCard mutation', () => {
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <PaymentMethodsPanel slug="test-org" cardOnFile={false} />
      </Wrapper>
    )
    expect(screen.getByText(/No card on file/i)).toBeInTheDocument()
    const addCardBtn = screen.getByRole('button', { name: /Add card/i })
    expect(addCardBtn).toBeInTheDocument()
    fireEvent.click(addCardBtn)
    expect(mockAddCardMutate).toHaveBeenCalledTimes(1)
    expect(mockAddCardMutate.mock.calls[0][0]).toMatchObject({ slug: 'test-org' })
    // Portal button should NOT be present
    expect(screen.queryByRole('button', { name: /Manage payment methods/i })).not.toBeInTheDocument()
  })

  it('card_on_file=true: renders "Card on file" badge + "Manage payment methods" button calling portal mutation', () => {
    const Wrapper = wrap(new QueryClient())
    render(
      <Wrapper>
        <PaymentMethodsPanel slug="test-org" cardOnFile={true} />
      </Wrapper>
    )
    expect(screen.getByText(/Card on file/i)).toBeInTheDocument()
    const portalBtn = screen.getByRole('button', { name: /Manage payment methods/i })
    expect(portalBtn).toBeInTheDocument()
    fireEvent.click(portalBtn)
    expect(mockPortalMutate).toHaveBeenCalledTimes(1)
    expect(mockPortalMutate.mock.calls[0][0]).toMatchObject({ slug: 'test-org' })
    // "Add card" button should NOT be present
    expect(screen.queryByRole('button', { name: /Add card/i })).not.toBeInTheDocument()
  })
})
