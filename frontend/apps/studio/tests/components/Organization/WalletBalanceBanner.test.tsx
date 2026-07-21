import { screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { WalletBalanceBanner } from '@/components/interfaces/Organization/WalletBalanceBanner'
import { render } from '@/tests/helpers'

let wallet: { balance_millicents: number; monthly_grant_millicents: number } | undefined
let org: { slug: string; plan?: { id: string } } = { slug: 'acme', plan: { id: 'free' } }
let billingUiEnabled = true

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: org }),
}))
vi.mock('@/hooks/misc/useIsBillingUiEnabled', () => ({
  useIsBillingUiEnabled: () => billingUiEnabled,
}))
vi.mock('@/data/billing/wallet-query', () => ({ useOrgWalletQuery: () => ({ data: wallet }) }))

beforeEach(() => {
  org = { slug: 'acme', plan: { id: 'free' } }
  billingUiEnabled = true
})

test('exhausted balance: shows exhausted banner + an Upgrade link', () => {
  wallet = { balance_millicents: 0, monthly_grant_millicents: 3_500_000 }
  render(<WalletBalanceBanner />)
  expect(screen.getByTestId('wallet-balance-banner')).toHaveTextContent(/exhausted/i)
  expect(screen.getByRole('link', { name: /upgrade/i })).toBeInTheDocument()
})

test('healthy balance: renders nothing', () => {
  wallet = { balance_millicents: 3_000_000, monthly_grant_millicents: 3_500_000 }
  const { container } = render(<WalletBalanceBanner />)
  expect(container).toBeEmptyDOMElement()
})

test('low balance (below 10% of grant): shows the low banner', () => {
  wallet = { balance_millicents: 100_000, monthly_grant_millicents: 3_500_000 }
  render(<WalletBalanceBanner />)
  expect(screen.getByTestId('wallet-balance-banner')).toHaveTextContent(/low/i)
})

test('boundary: balance exactly 10% of grant still shows low (<= threshold)', () => {
  wallet = { balance_millicents: 350_000, monthly_grant_millicents: 3_500_000 }
  render(<WalletBalanceBanner />)
  expect(screen.getByTestId('wallet-balance-banner')).toHaveTextContent(/low/i)
})

test('grant 0 with positive balance: renders nothing (the monthly_grant>0 guard holds)', () => {
  wallet = { balance_millicents: 100_000, monthly_grant_millicents: 0 }
  const { container } = render(<WalletBalanceBanner />)
  expect(container).toBeEmptyDOMElement()
})

test('billing UI off: renders nothing even when exhausted (global mount stays hidden pre-GA)', () => {
  billingUiEnabled = false
  wallet = { balance_millicents: 0, monthly_grant_millicents: 3_500_000 }
  const { container } = render(<WalletBalanceBanner />)
  expect(container).toBeEmptyDOMElement()
})
