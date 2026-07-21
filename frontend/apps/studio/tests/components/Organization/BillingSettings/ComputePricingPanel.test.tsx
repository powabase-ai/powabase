import { fireEvent, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { ComputePricingPanel } from '@/components/interfaces/Organization/BillingSettings/ComputePricingPanel'
import { render } from '@/tests/helpers'

const SIZES = [
  {
    id: 'nano',
    display_name: 'Sandbox',
    postgres_vcpu_millicores: 500,
    postgres_ram_mib: 1024,
    total_vcpu_millicores: 1000,
    total_ram_mib: 2048,
    bundles: { egress_gb: 5, s3_storage_gb: 1, ebs_storage_gb: 2, regular_mau: 50000 },
    // cogs 2470 m¢/hr × plan bp, floor /10000 (control-plane compute_pricing.py)
    prices_by_plan: { free: 3458, 'self-serve': 2964, scale: 2717 },
  },
  {
    id: 'small',
    display_name: 'Workshop',
    postgres_vcpu_millicores: 1000,
    postgres_ram_mib: 2048,
    total_vcpu_millicores: 2500,
    total_ram_mib: 5632,
    bundles: { egress_gb: 40, s3_storage_gb: 10, ebs_storage_gb: 8, regular_mau: 100000 },
    // cogs 6660 m¢/hr × plan bp, floor /10000
    prices_by_plan: { free: 9324, 'self-serve': 7992, scale: 7326 },
  },
]

let sizes: unknown = SIZES
vi.mock('@/data/billing/compute-sizes-query', () => ({
  useComputeSizesQuery: () => ({ data: sizes }),
}))

test('renders a row per tier; Free nano rate read from the server-priced row', () => {
  sizes = SIZES
  render(<ComputePricingPanel slug="acme" planTier="free" />)
  expect(screen.getByText('Sandbox')).toBeInTheDocument()
  expect(screen.getByText('Workshop')).toBeInTheDocument()
  // nano prices_by_plan.free = 3458 m¢/hr → millicentsToUsd = 0.03458 → "$0.0346"
  expect(screen.getByTestId('compute-row-nano')).toHaveTextContent('$0.0346')
})

test('the rate column follows the plan selector', () => {
  sizes = SIZES
  render(<ComputePricingPanel slug="acme" planTier="free" />)
  fireEvent.change(screen.getByTestId('compute-rate-plan'), { target: { value: 'scale' } })
  // nano prices_by_plan.scale = 2717 m¢/hr → millicentsToUsd = 0.02717 → "$0.0272"
  expect(screen.getByTestId('compute-row-nano')).toHaveTextContent('$0.0272')
})

test('renders nothing when there are no sizes', () => {
  sizes = []
  const { container } = render(<ComputePricingPanel slug="acme" planTier="free" />)
  expect(container).toBeEmptyDOMElement()
})

test('row missing prices_by_plan: renders "—" for the rate instead of crashing', () => {
  // A live /compute-sizes row that (for whatever reason — BE bug, stale cache
  // shape) lacks prices_by_plan. Unguarded, `row.prices_by_plan[plan]` would
  // throw inside .map() and crash the whole panel.
  sizes = [
    {
      id: 'xlarge',
      display_name: 'Hyperscale',
      postgres_vcpu_millicores: 8000,
      postgres_ram_mib: 16384,
      total_vcpu_millicores: 22000,
      total_ram_mib: 34816,
      bundles: { egress_gb: 400, s3_storage_gb: 150, ebs_storage_gb: 100, regular_mau: 100000 },
    },
  ]
  render(<ComputePricingPanel slug="acme" planTier="free" />)
  expect(screen.getByText('Hyperscale')).toBeInTheDocument()
  expect(screen.getByTestId('compute-row-xlarge')).toHaveTextContent('—')
})
