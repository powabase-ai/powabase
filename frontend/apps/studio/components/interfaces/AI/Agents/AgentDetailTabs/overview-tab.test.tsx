import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Agent } from '@/hooks/ai/useProjectSupabaseClient'
import type { ModelInfo } from '@/lib/ai-api/models-api'
import { render } from '@/tests/helpers'

import { OverviewTab } from './overview-tab'

const { updateSpy, catalog } = vi.hoisted(() => ({
  updateSpy: vi.fn(),
  catalog: { models: [] as ModelInfo[], isLoading: false },
}))

vi.mock('@/hooks/ai/useProjectSupabaseClient', () => ({
  useProjectSupabaseClient: () => ({ token: 'fake-token', ref: 'default', orgSlug: 'org-1' }),
}))

vi.mock('@/hooks/ai/useLLMModels', () => ({
  useLLMModels: () => catalog,
}))

vi.mock('@/lib/ai-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai-api')>('@/lib/ai-api')
  return { ...actual, agentsApi: { ...actual.agentsApi, update: updateSpy } }
})

// The real selector pulls provider keys and badges from several queries; a
// plain <select> is enough to drive model switches here.
vi.mock('@/components/interfaces/AI/Agents/ModelSelector', () => ({
  ModelSelector: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select aria-label="Model" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a model...</option>
      {[
        'gpt-5',
        'claude-opus-5-5',
        'openrouter/moonshotai/kimi-k3',
        'gpt-4.1',
        'anthropic/some-custom-model',
      ].map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  ),
}))

function model(id: string, efforts: string[], extra: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id,
    display_name: id,
    provider: 'openai',
    tier: 'balanced',
    recommended: false,
    available: true,
    context_window: null,
    unavailable_reason: null,
    supports_reasoning: efforts.length > 0,
    reasoning_efforts: efforts,
    ...extra,
  }
}

const CATALOG: ModelInfo[] = [
  model('gpt-5', ['minimal', 'low', 'medium', 'high']),
  model('claude-opus-5-5', ['low', 'medium', 'high'], { provider: 'anthropic' }),
  model('openrouter/moonshotai/kimi-k3', ['low', 'high'], { provider: 'openrouter' }),
  model('gpt-4.1', []),
]

function makeAgent(modelId: string, effort?: string): Agent {
  return {
    id: 'agent-1',
    name: 'Agent',
    system_prompt: '',
    model: modelId,
    settings: effort ? { reasoning_effort: effort, temperature: 0.2 } : { temperature: 0.2 },
    created_at: null,
    updated_at: null,
  } as unknown as Agent
}

function effortSelect() {
  return screen.getByLabelText('Reasoning effort') as HTMLSelectElement
}

function optionValues(select: HTMLSelectElement) {
  return Array.from(select.options).map((o) => o.value)
}

beforeEach(() => {
  updateSpy.mockReset()
  updateSpy.mockResolvedValue({})
  catalog.models = CATALOG
  catalog.isLoading = false
})

describe('OverviewTab — reasoning effort', () => {
  it("offers only the selected model's efforts plus a provider-default option", () => {
    render(
      <OverviewTab
        agent={makeAgent('openrouter/moonshotai/kimi-k3')}
        stats={null}
        onAgentUpdate={() => {}}
      />
    )
    const select = effortSelect()
    expect(optionValues(select)).toEqual(['', 'low', 'high'])
    expect(select.options[0].textContent).toBe('Default (model decides)')
    expect(screen.queryByRole('option', { name: 'None' })).not.toBeInTheDocument()
  })

  it('lists "minimal" only for models that support it', () => {
    render(<OverviewTab agent={makeAgent('gpt-5')} stats={null} onAgentUpdate={() => {}} />)
    expect(optionValues(effortSelect())).toEqual(['', 'minimal', 'low', 'medium', 'high'])
  })

  it('clears a saved effort the newly selected model does not support, and saves it cleared', async () => {
    const onAgentUpdate = vi.fn()
    render(
      <OverviewTab agent={makeAgent('gpt-5', 'minimal')} stats={null} onAgentUpdate={onAgentUpdate} />
    )
    expect(effortSelect().value).toBe('minimal')

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'claude-opus-5-5' } })

    await waitFor(() => expect(effortSelect().value).toBe(''))
    expect(optionValues(effortSelect())).toEqual(['', 'low', 'medium', 'high'])

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    const updates = updateSpy.mock.calls[0][3]
    expect(updates.model).toBe('claude-opus-5-5')
    expect(updates.settings).toEqual({ temperature: 0.2 })
  })

  it('keeps a saved effort the newly selected model also supports', async () => {
    render(<OverviewTab agent={makeAgent('gpt-5', 'high')} stats={null} onAgentUpdate={() => {}} />)
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'openrouter/moonshotai/kimi-k3' },
    })
    await waitFor(() => expect(optionValues(effortSelect())).toEqual(['', 'low', 'high']))
    expect(effortSelect().value).toBe('high')
  })

  it('hides the control for a non-reasoning model and drops its stale effort on save', async () => {
    render(<OverviewTab agent={makeAgent('gpt-4.1', 'high')} stats={null} onAgentUpdate={() => {}} />)
    expect(screen.queryByText('Reasoning effort')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    expect(updateSpy.mock.calls[0][3].settings).toEqual({ temperature: 0.2 })
  })

  it('offers the full generic ladder for an off-catalog model and keeps its saved effort', () => {
    render(
      <OverviewTab
        agent={makeAgent('anthropic/some-custom-model', 'medium')}
        stats={null}
        onAgentUpdate={() => {}}
      />
    )
    const select = effortSelect()
    expect(optionValues(select)).toEqual(['', 'minimal', 'low', 'medium', 'high'])
    expect(select.value).toBe('medium')
  })

  it('treats a model whose reasoning support is unknown like an off-catalog model', () => {
    catalog.models = [model('gpt-5.4', [], { reasoning_unknown: true })]
    render(<OverviewTab agent={makeAgent('gpt-5.4', 'low')} stats={null} onAgentUpdate={() => {}} />)
    const select = effortSelect()
    expect(optionValues(select)).toEqual(['', 'minimal', 'low', 'medium', 'high'])
    expect(select.value).toBe('low')
  })

  it('does not clear a saved effort while the catalog is still loading', async () => {
    catalog.models = []
    catalog.isLoading = true
    render(<OverviewTab agent={makeAgent('gpt-4.1', 'high')} stats={null} onAgentUpdate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
