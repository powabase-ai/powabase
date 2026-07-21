import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render } from '@/tests/helpers'

const { mockUsePricingQuery, mockUseIsFeatureEnabled } = vi.hoisted(() => ({
  mockUsePricingQuery: vi.fn(),
  mockUseIsFeatureEnabled: vi.fn(() => true),
}))

vi.mock('@/data/credits/pricing-query', () => ({
  usePricingQuery: mockUsePricingQuery,
}))

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: mockUseIsFeatureEnabled,
}))

vi.mock('@/components/layouts/DefaultLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/layouts/OrganizationLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import PricingPage from '@/pages/org/[slug]/credits/pricing'

const mockCatalog = [
  {
    action: 'agent_run',
    unit_credits: 200,
    unit_label: 'run',
    description: 'Agent run base fee',
    cost_model: 'fixed' as const,
  },
  {
    action: 'web_search_deep',
    unit_credits: 8000,
    unit_label: 'call',
    description: 'Web search Deep',
    cost_model: 'fixed' as const,
  },
  {
    action: 'workflow_block_other',
    unit_credits: 0,
    unit_label: 'call',
    description: 'Free workflow blocks',
    cost_model: 'fixed' as const,
  },
  {
    action: 'llm_call',
    unit_credits: 0,
    unit_label: 'call',
    description: 'LLM passthrough (handled separately)',
    cost_model: 'llm_passthrough' as const,
  },
]

describe('Pricing page (Set A — fixed rows)', () => {
  beforeEach(() => {
    // Production default: credits:enabled=true, billing:ai_on_us=false.
    // Set A asserts behavior with the AI-on-us gate OFF (Phase 10.4 baseline).
    mockUseIsFeatureEnabled.mockImplementation((feature: string) => {
      return feature === 'credits:enabled'
    })
    mockUsePricingQuery.mockReturnValue({
      data: { pricing: mockCatalog },
      isLoading: false,
      isError: false,
    })
  })

  it('renders agent_run as $0.0020 per run', () => {
    render(<PricingPage dehydratedState={{}} />)
    expect(screen.getByText('agent_run')).toBeInTheDocument()
    expect(screen.getByText(/\$0\.0020 per run/)).toBeInTheDocument()
  })

  it('renders web_search_deep as $0.08 per call', () => {
    render(<PricingPage dehydratedState={{}} />)
    expect(screen.getByText(/\$0\.08 per call/)).toBeInTheDocument()
  })

  it('renders workflow_block_other as Free', () => {
    render(<PricingPage dehydratedState={{}} />)
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('hides llm_passthrough rows from the catalog table', () => {
    render(<PricingPage dehydratedState={{}} />)
    expect(screen.queryByText('llm_call')).not.toBeInTheDocument()
  })
})

describe('Pricing page (Set B — llm_call row, gated)', () => {
  const catalogWithLlm = [
    ...mockCatalog.filter((r) => r.action !== 'llm_call'),
    {
      action: 'llm_call',
      unit_credits: 0,
      unit_label: 'call',
      description: 'AI-on-us LLM call',
      cost_model: 'llm_passthrough' as const,
    },
  ]

  beforeEach(() => {
    mockUseIsFeatureEnabled.mockImplementation((feature: string) => {
      // credits:enabled is required for the page to render at all; the
      // billing:ai_on_us gate is exercised via the isAiOnUsEnabled prop.
      return feature === 'credits:enabled'
    })
    mockUsePricingQuery.mockReturnValue({
      data: { pricing: catalogWithLlm },
      isLoading: false,
      isError: false,
    })
  })

  it('renders llm_call row when flag is on', () => {
    render(<PricingPage dehydratedState={{}} isAiOnUsEnabled={true} />)
    expect(screen.getByText(/AI-on-us LLM call/)).toBeInTheDocument()
    expect(screen.getByText(/Variable/i)).toBeInTheDocument()
  })

  it('hides llm_call row when flag is off', () => {
    render(<PricingPage dehydratedState={{}} isAiOnUsEnabled={false} />)
    expect(screen.queryByText(/AI-on-us LLM call/)).toBeNull()
  })
})
