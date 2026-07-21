import { screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { NewProjectLimitReached } from '@/components/interfaces/ProjectCreation/NewProjectLimitReached'
import { render } from '@/tests/helpers'

// Stub FreeProjectLimitWarning to avoid pulling UpgradePlanButton's hook chain.
vi.mock('@/components/interfaces/ProjectCreation/FreeProjectLimitWarning', () => ({
  FreeProjectLimitWarning: () => <div data-testid="free-limit-warning" />,
}))

test('billing UI on: shows the upgrade warning (with its in-page upgrade CTA)', () => {
  render(<NewProjectLimitReached membersExceededLimit={[] as never} billingUiEnabled />)
  expect(screen.getByTestId('free-limit-warning')).toBeInTheDocument()
})

test('billing UI off: shows the contact fallback, not the upgrade CTA', () => {
  render(<NewProjectLimitReached membersExceededLimit={[] as never} billingUiEnabled={false} />)
  expect(screen.getByText(/contact hello@powabase\.ai/i)).toBeInTheDocument()
  expect(screen.queryByTestId('free-limit-warning')).not.toBeInTheDocument()
})
