import { fireEvent, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { ComputeTierPicker } from '@/components/interfaces/Billing/ComputeTierPicker'
import { render } from '@/tests/helpers'

test('renders five tier cards and selects on click', () => {
  const onSelect = vi.fn()
  render(<ComputeTierPicker planTier="self-serve" value="nano" onSelect={onSelect} />)
  expect(screen.getByText('Sandbox')).toBeInTheDocument()
  expect(screen.getByText('Foundry')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Workshop'))
  expect(onSelect).toHaveBeenCalledWith('small')
})

test('nano Sandbox does NOT show FREE badge (Decision #37: sandboxSubsidy=false)', () => {
  // firstSandboxFree prop removed — badge is now driven by tier.sandboxSubsidy.
  // All tiers have sandboxSubsidy: false post-Decision #37, so FREE never renders.
  render(<ComputeTierPicker planTier="free" value="nano" onSelect={() => {}} />)
  expect(screen.queryByText('FREE')).not.toBeInTheDocument()
})
