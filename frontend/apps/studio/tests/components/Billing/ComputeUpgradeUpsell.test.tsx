import { screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { ComputeUpgradeUpsell } from '@/components/interfaces/Billing/ComputeUpgradeUpsell'
import { render } from '@/tests/helpers'

let billingUiEnabled = true

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: { slug: 'acme', plan: { id: 'free' } } }),
}))
vi.mock('@/hooks/misc/useIsBillingUiEnabled', () => ({
  useIsBillingUiEnabled: () => billingUiEnabled,
}))

beforeEach(() => {
  billingUiEnabled = true
})

test('free: nudges to Self-Serve with a billing link', () => {
  render(<ComputeUpgradeUpsell planTier="free" />)
  expect(screen.getByRole('link', { name: /upgrade to self-serve/i })).toHaveAttribute(
    'href',
    '/org/acme/billing#powabase-plan-picker'
  )
})

test('self-serve: nudges to Scale', () => {
  render(<ComputeUpgradeUpsell planTier="self-serve" />)
  expect(screen.getByRole('link', { name: /upgrade to scale/i })).toBeInTheDocument()
})

test('scale: renders nothing', () => {
  const { container } = render(<ComputeUpgradeUpsell planTier="scale" />)
  expect(container).toBeEmptyDOMElement()
})

test('billing UI off: renders nothing even below Scale (self-gate)', () => {
  billingUiEnabled = false
  const { container } = render(<ComputeUpgradeUpsell planTier="free" />)
  expect(container).toBeEmptyDOMElement()
})
