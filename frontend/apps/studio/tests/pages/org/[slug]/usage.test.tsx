import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render } from '@/tests/helpers'

// PR 416 C9: Usage page Credits overview renders millicent values via
// `formatBillingAmount` (yielding $X.XX strings) instead of raw integers
// labeled "credits".
//
// Migration 0014: the free plan no longer refills (monthly_credits=0), so the
// free Credits card shows the balance alone with no cap and no reset line —
// matching the top-header credit bar. Paid plans keep the cap + reset framing.

const { mockUseRouter, mockUseCreditsLimitsQuery, mockUseIsFeatureEnabled, mockUseOrgStatsQuery } =
  vi.hoisted(() => ({
    mockUseRouter: vi.fn(() => ({ query: { slug: 'test-org' }, push: vi.fn() })),
    mockUseCreditsLimitsQuery: vi.fn(),
    mockUseIsFeatureEnabled: vi.fn(),
    mockUseOrgStatsQuery: vi.fn(() => ({
      data: { projects: [], series: [] },
      isLoading: false,
      isError: false,
    })),
  }))

vi.mock('next/router', () => ({
  useRouter: mockUseRouter,
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/data/credits/limits-query', () => ({
  useCreditsLimitsQuery: mockUseCreditsLimitsQuery,
}))

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: mockUseIsFeatureEnabled,
}))

vi.mock('@/data/observability/use-org-stats-query', () => ({
  useOrgStatsQuery: mockUseOrgStatsQuery,
}))

// Layouts pull in a lot of providers; the page body itself is the default
// export and renders without the layout in tests.
vi.mock('@/components/layouts/DefaultLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/layouts/OrganizationLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import OrgUsagePage from '@/pages/org/[slug]/usage'

const FUTURE_ISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  // credits:enabled true; credits:activity false to skip the tab wrapper.
  mockUseIsFeatureEnabled.mockImplementation((key: string) => key === 'credits:enabled')
})

describe('Usage page — Credits overview, free plan (one-time grant)', () => {
  it('renders the balance alone (no cap, no reset) for a free org', () => {
    // Post-0014 free payload: monthly_credits=0, balance is the one-time grant.
    mockUseCreditsLimitsQuery.mockReturnValue({
      data: {
        org_id: 'org-1',
        plan_id: 'free',
        monthly_credits: 0,
        balance: 2_000_000,
        renews_at: FUTURE_ISO,
      },
      isError: false,
    })

    render(<OrgUsagePage dehydratedState={undefined} />)

    // Balance shown via formatBillingAmount, alone — not "$X of $Y".
    expect(screen.getByText('$20.00')).toBeInTheDocument()
    expect(screen.queryByText(/of \$/)).toBeNull()
    // No reset wording; a non-expiry note instead.
    expect(screen.queryByText(/Resets/)).toBeNull()
    expect(screen.getByText(/doesn't expire/)).toBeInTheDocument()
    // Still no raw-integer / "credits" leakage (PR 416 C9).
    expect(screen.queryByText(/credits remaining/)).toBeNull()
    expect(screen.queryByText(/2,000,000/)).toBeNull()
  })
})

describe('Usage page — Credits overview, paid plan (monthly allowance)', () => {
  it('renders "$X of $Y" plus the reset line for a refilling plan', () => {
    mockUseCreditsLimitsQuery.mockReturnValue({
      data: {
        org_id: 'org-1',
        plan_id: 'pro',
        monthly_credits: 2_000_000,
        balance: 2_000_000,
        renews_at: FUTURE_ISO,
      },
      isError: false,
    })

    render(<OrgUsagePage dehydratedState={undefined} />)

    expect(screen.getByText(/\$20\.00 of \$20\.00/)).toBeInTheDocument()
    expect(screen.getByText(/Resets monthly/)).toBeInTheDocument()
  })
})
