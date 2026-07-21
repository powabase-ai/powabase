import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { ComputeTierCard } from '@/components/interfaces/Billing/ComputeTierCard'
import { COMPUTE_TIERS } from '@/data/billing/compute-tiers.display'
import { render } from '@/tests/helpers'

const nano = COMPUTE_TIERS.find((t) => t.id === 'nano')!

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: { slug: 'acme' } }),
}))

// cogs 2470 m¢/hr × plan bp, floor /10000 (control-plane compute_pricing.py) —
// same fixture values as ComputePricingPanel.test.tsx, so the two components'
// price displays are pinned to the same server-computed source of truth.
let sizes: unknown = [
  { id: 'nano', prices_by_plan: { free: 3458, 'self-serve': 2964, scale: 2717 } },
]
vi.mock('@/data/billing/compute-sizes-query', () => ({
  useComputeSizesQuery: () => ({ data: sizes }),
}))

test('renders the server-computed price for the current plan', () => {
  sizes = [{ id: 'nano', prices_by_plan: { free: 3458, 'self-serve': 2964, scale: 2717 } }]
  render(<ComputeTierCard tier={nano} planTier="free" selected={false} onClick={() => {}} />)
  expect(screen.getByText('$0.0346')).toBeInTheDocument()
})

test('wide card shows the per-plan price breakdown, all from the server', () => {
  sizes = [{ id: 'nano', prices_by_plan: { free: 3458, 'self-serve': 2964, scale: 2717 } }]
  render(
    <ComputeTierCard
      tier={nano}
      planTier="scale"
      selected={false}
      onClick={() => {}}
      variant="wide"
    />
  )
  expect(screen.getByText('$0.0346')).toBeInTheDocument() // free row
  expect(screen.getByText('$0.0296')).toBeInTheDocument() // self-serve row
  expect(screen.getByText('$0.0272')).toBeInTheDocument() // scale row (current plan)
})

test('renders "—" instead of crashing while price data has not loaded yet', () => {
  sizes = undefined
  render(<ComputeTierCard tier={nano} planTier="free" selected={false} onClick={() => {}} />)
  expect(screen.getByText('—')).toBeInTheDocument()
})
