import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { LedgerRow } from '@/data/credits/ledger-query'
import { render } from '@/tests/helpers'

import { ActivityTable } from './ActivityTable'

// Used by Set B tests: an llm_call row carries the model identifier in its
// metadata blob (shaped by the billing service's `metadata_` JSONB column).
// PR 416 C5: the model id is the STRIPPED form because LiteLLM removes the
// `<provider>/` prefix before dispatching the callback. Ground truth:
// agentic-platform/packages/agentic-project-service/tests/integration/
// test_billing_e2e_ai_on_us.py asserts metadata["model"] == "claude-haiku-4-5".
const llmCallRow: LedgerRow = {
  id: '4',
  action: 'llm_call',
  project_id: null,
  quantity: 1,
  unit_credits: 468,
  credits: -468,
  status: 'committed',
  ref_type: null,
  ref_id: null,
  created_at: '2026-05-26T12:00:00Z',
  metadata: {
    model: 'claude-sonnet-4-6',
    prompt_tokens: 1000,
    completion_tokens: 500,
  },
}

const baseRow: Omit<LedgerRow, 'id' | 'action' | 'credits' | 'created_at' | 'status'> = {
  project_id: null,
  quantity: 1,
  unit_credits: 0,
  ref_type: null,
  ref_id: null,
}

const mockRows: LedgerRow[] = [
  {
    ...baseRow,
    id: '1',
    action: 'agent_run',
    quantity: 1,
    unit_credits: 200,
    credits: -200,
    status: 'committed',
    created_at: '2026-05-26T10:00:00Z',
  },
  {
    ...baseRow,
    id: '2',
    action: 'web_search_deep',
    quantity: 1,
    unit_credits: 8000,
    credits: -8000,
    status: 'committed',
    created_at: '2026-05-26T11:00:00Z',
  },
  {
    ...baseRow,
    id: '3',
    action: 'monthly_grant',
    quantity: 1,
    unit_credits: 500_000,
    credits: 500_000,
    status: 'grant',
    created_at: '2026-05-01T00:00:00Z',
  },
]

describe('ActivityTable (Set A — existing-action $ rendering)', () => {
  it('renders agent_run charge of -200 millicents as "-$0.0020"', () => {
    render(<ActivityTable rows={mockRows} projectsById={{}} />)
    expect(screen.getByText('-$0.0020')).toBeInTheDocument()
  })

  it('renders web_search_deep charge of -8000 millicents as "-$0.08"', () => {
    render(<ActivityTable rows={mockRows} projectsById={{}} />)
    expect(screen.getByText('-$0.08')).toBeInTheDocument()
  })

  it('renders Unit column as $ from millicents (web_search_deep unit_credits=8000 → "$0.08")', () => {
    render(<ActivityTable rows={mockRows} projectsById={{}} />)
    // Unit column renders unit_credits via formatBillingAmount (positive,
    // no sign) — distinct from the Credits column which carries the
    // negative sign for charges.
    expect(screen.getByText('$0.08')).toBeInTheDocument()
  })

  it('renders monthly_grant of +500_000 millicents as "$5.00"', () => {
    render(<ActivityTable rows={mockRows} projectsById={{}} />)
    // Post-fix: both Unit and Credits columns format unit_credits/credits
    // through formatBillingAmount, and for monthly_grant they are equal
    // (qty=1 → unit_credits == credits). Expect two matches: one in the
    // Unit cell, one in the Credits cell.
    expect(screen.getAllByText('$5.00')).toHaveLength(2)
  })

  it('hides llm_call rows (deferred to Phase 11.3)', () => {
    const withLlm: LedgerRow[] = [
      ...mockRows,
      {
        ...baseRow,
        id: '4',
        action: 'llm_call',
        quantity: 1,
        unit_credits: 1234,
        credits: -1234,
        status: 'committed',
        created_at: '2026-05-26T12:00:00Z',
      },
    ]
    render(<ActivityTable rows={withLlm} projectsById={{}} />)
    expect(screen.queryByText('llm_call')).not.toBeInTheDocument()
  })

  it('still shows the empty-state when only llm_call rows are present', () => {
    const onlyLlm: LedgerRow[] = [
      {
        ...baseRow,
        id: '5',
        action: 'llm_call',
        quantity: 1,
        unit_credits: 1234,
        credits: -1234,
        status: 'committed',
        created_at: '2026-05-26T12:00:00Z',
      },
    ]
    render(<ActivityTable rows={onlyLlm} projectsById={{}} />)
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument()
  })
})

describe('ActivityTable (Set B — llm_call rows, gated)', () => {
  const rowsWithLlm: LedgerRow[] = [...mockRows, llmCallRow]

  it('renders llm_call row with model name and $ amount when flag is on', () => {
    render(
      <ActivityTable rows={rowsWithLlm} projectsById={{}} isAiOnUsEnabled={true} />,
    )
    expect(screen.getByText(/Claude Sonnet 4\.6/i)).toBeInTheDocument()
    // 468 millicents = $0.00468 → formatted as -$0.0047
    expect(screen.getByText(/-\$0\.0047/)).toBeInTheDocument()
  })

  it('does NOT show token counts in the billing surface', () => {
    render(
      <ActivityTable rows={rowsWithLlm} projectsById={{}} isAiOnUsEnabled={true} />,
    )
    expect(screen.queryByText(/prompt_tokens/)).toBeNull()
    expect(screen.queryByText(/1000/)).toBeNull()
  })

  it('hides llm_call rows when flag is off', () => {
    render(
      <ActivityTable rows={rowsWithLlm} projectsById={{}} isAiOnUsEnabled={false} />,
    )
    expect(screen.queryByText(/Claude Sonnet/)).toBeNull()
  })
})
