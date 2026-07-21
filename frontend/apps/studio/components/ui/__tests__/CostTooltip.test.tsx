import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { render } from '@/tests/helpers'
import { CostTooltip } from '../CostTooltip'

describe('CostTooltip — fixed cost_model', () => {
  it('renders $X.XX per unit_label for fixed rows', () => {
    render(
      <CostTooltip
        action="web_search_deep"
        unitCredits={8000}
        unitLabel="call"
        costModel="fixed"
      />,
    )
    // 8000 millicents = $0.08
    expect(screen.getByText(/\$0\.08 per call/)).toBeInTheDocument()
  })

  it('renders Free for fixed rows with unit_credits=0', () => {
    render(
      <CostTooltip
        action="workflow_block_other"
        unitCredits={0}
        unitLabel="call"
        costModel="fixed"
      />,
    )
    expect(screen.getByText(/Free/)).toBeInTheDocument()
  })
})

describe('CostTooltip — llm_passthrough cost_model (gated)', () => {
  it('renders the variable-rate explanation for llm_call rows when flag is on', () => {
    render(
      <CostTooltip
        action="llm_call"
        unitCredits={0}
        unitLabel="call"
        costModel="llm_passthrough"
        isAiOnUsEnabled={true}
      />,
    )
    expect(screen.getByText(/Variable.*25%.*your LLM provider/i)).toBeInTheDocument()
    expect(screen.getByText(/BYOK projects.*\$0/i)).toBeInTheDocument()
  })

  it('hides llm_call rows entirely when flag is off', () => {
    const { container } = render(
      <CostTooltip
        action="llm_call"
        unitCredits={0}
        unitLabel="call"
        costModel="llm_passthrough"
        isAiOnUsEnabled={false}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
