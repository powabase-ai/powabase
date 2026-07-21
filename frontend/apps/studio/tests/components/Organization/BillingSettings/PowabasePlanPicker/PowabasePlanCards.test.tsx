import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import {
  PowabasePlanCards,
  checkoutErrorMessage,
} from '@/components/interfaces/Organization/BillingSettings/PowabasePlanPicker/PowabasePlanCards'
import { CheckoutSessionError } from '@/data/billing/checkout-session-mutation'
import { render } from '@/tests/helpers'

const mutate = vi.fn()
vi.mock('@/data/billing/checkout-session-mutation', () => ({
  useCreateCheckoutSessionMutation: () => ({ mutate, isPending: false }),
  CheckoutSessionError: class CheckoutSessionError extends Error {},
}))

test('free org: Free is current; paid tiers show Upgrade', () => {
  render(<PowabasePlanCards slug="acme" currentPlanId="free" />)
  expect(screen.getByTestId('plan-card-free')).toHaveTextContent('Current plan')
  expect(screen.getByRole('button', { name: /upgrade to self-serve/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /upgrade to scale/i })).toBeInTheDocument()
  // only the current plan is green-highlighted; the popular (self-serve) card is badge-only
  expect(screen.getByTestId('plan-card-free')).toHaveClass('border-brand')
  expect(screen.getByTestId('plan-card-self-serve')).not.toHaveClass('border-brand')
})

test('self-serve org: lower tier shows Included; only Scale is an Upgrade', () => {
  render(<PowabasePlanCards slug="acme" currentPlanId="self-serve" />)
  expect(screen.getByTestId('plan-card-self-serve')).toHaveTextContent('Current plan')
  expect(screen.getByTestId('plan-card-free')).toHaveTextContent('Included in your plan')
  expect(screen.getByRole('button', { name: /upgrade to scale/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /upgrade to self-serve/i })).not.toBeInTheDocument()
})

test('clicking an Upgrade starts checkout with that plan_id', () => {
  render(<PowabasePlanCards slug="acme" currentPlanId="free" />)
  fireEvent.click(screen.getByRole('button', { name: /upgrade to scale/i }))
  expect(mutate).toHaveBeenCalledWith(
    expect.objectContaining({ slug: 'acme', planId: 'scale' }),
    expect.anything()
  )
})

describe('checkoutErrorMessage', () => {
  const make = (errorHint?: string, serverMessage?: string) => {
    // The test mocks CheckoutSessionError as a bare class, but tsc checks the
    // real constructor (an object arg); pass the real shape, set fields via assign.
    const e = new CheckoutSessionError({ status: 400, message: 'checkout failed' })
    Object.assign(e, { errorHint, serverMessage })
    return e
  }

  test.each([
    ['use_portal_for_downgrade', /Customer Portal/i],
    ['stripe_error', /could not reach Stripe/i],
    ['not_synced', /not yet synced/i],
    ['invalid_plan', /not available/i],
    ['already_on_plan', /already on this plan/i],
    ['not_owner', /only the organization owner/i],
    ['billing_disabled', /not configured/i],
  ])('maps error_hint %s to its specific copy', (hint, re) => {
    expect(checkoutErrorMessage(make(hint as string))).toMatch(re as RegExp)
  })

  test('card_declined uses serverMessage when present, else the default copy', () => {
    expect(checkoutErrorMessage(make('card_declined', 'Your bank declined it'))).toBe(
      'Your bank declined it'
    )
    expect(checkoutErrorMessage(make('card_declined'))).toMatch(/card was declined/i)
  })

  test('unknown hint falls back to serverMessage ?? generic copy', () => {
    expect(checkoutErrorMessage(make('brand_new_hint', 'server says hi'))).toBe('server says hi')
    expect(checkoutErrorMessage(make('brand_new_hint'))).toMatch(/Subscription request failed/i)
  })

  test('a non-CheckoutSessionError gets the generic catch-all', () => {
    expect(checkoutErrorMessage(new Error('boom'))).toMatch(/Unexpected error/i)
  })
})
