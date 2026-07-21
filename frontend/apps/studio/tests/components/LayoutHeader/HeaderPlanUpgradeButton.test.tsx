import { screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { HeaderPlanUpgradeButton } from '@/components/layouts/Navigation/LayoutHeader/HeaderPlanUpgradeButton'
import { render } from '@/tests/helpers'

let org: { slug: string; plan?: { id: string } } | undefined
let billingUiEnabled = true

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: org }),
}))
vi.mock('@/hooks/misc/useIsBillingUiEnabled', () => ({
  useIsBillingUiEnabled: () => billingUiEnabled,
}))

beforeEach(() => {
  org = { slug: 'acme', plan: { id: 'free' } }
  billingUiEnabled = true
})

test('free org, billing UI on: shows a desktop-only Upgrade link to the plan-picker anchor', () => {
  render(<HeaderPlanUpgradeButton />)
  const link = screen.getByRole('link', { name: /upgrade/i })
  expect(link).toHaveAttribute('href', '/org/acme/billing#powabase-plan-picker')
  expect(link).toHaveClass('hidden', 'md:flex')
})

test('scale org: hidden', () => {
  org = { slug: 'acme', plan: { id: 'scale' } }
  render(<HeaderPlanUpgradeButton />)
  expect(screen.queryByRole('link', { name: /upgrade/i })).not.toBeInTheDocument()
})

test('billing UI off: hidden', () => {
  billingUiEnabled = false
  render(<HeaderPlanUpgradeButton />)
  expect(screen.queryByRole('link', { name: /upgrade/i })).not.toBeInTheDocument()
})
