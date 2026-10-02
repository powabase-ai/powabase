import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelInfo } from '@/lib/ai-api/models-api'
import { render } from '@/tests/helpers'

import { SettingsTab } from './settings-tab'

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
  return {
    ...actual,
    orchestrationsApi: { ...actual.orchestrationsApi, update: updateSpy },
  }
})

vi.mock('@/components/interfaces/AI/Agents/ModelSelector', () => ({
  ModelSelector: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select aria-label="Orchestrator model" value={value} onChange={(e) => onChange(e.target.value)}>
      {['gpt-5', 'claude-sonnet-5-5', 'openrouter/moonshotai/kimi-k3', 'gpt-4.1', 'my-custom-model'].map(
        (id) => (
          <option key={id} value={id}>
            {id}
          </option>
        )
      )}
    </select>
  ),
}))

function model(id: string, efforts: string[]): ModelInfo {
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
  }
}

const CATALOG: ModelInfo[] = [
  model('gpt-5', ['minimal', 'low', 'medium', 'high']),
  model('claude-sonnet-5-5', ['low', 'medium', 'high']),
  model('openrouter/moonshotai/kimi-k3', ['low', 'high']),
  model('gpt-4.1', []),
]

function makeOrchestration(modelId: string, effort?: string) {
  return {
    id: 'orch-1',
    name: 'Orch',
    description: null,
    strategy: 'supervisor',
    settings: {
      model: modelId,
      max_steps: 25,
      orchestrator_config: effort ? { reasoning_effort: effort, keep: true } : { keep: true },
    },
    created_at: '',
    updated_at: '',
  }
}

function effortSelect() {
  return screen.getByLabelText('Reasoning effort') as HTMLSelectElement
}

function optionValues(select: HTMLSelectElement) {
  return Array.from(select.options).map((o) => o.value)
}

beforeEach(() => {
  updateSpy.mockReset()
  updateSpy.mockImplementation(async (_t, _r, _id, body) => ({ ...makeOrchestration('gpt-5'), ...body }))
  catalog.models = CATALOG
  catalog.isLoading = false
})

describe('SettingsTab — orchestrator reasoning effort', () => {
  it("offers only the orchestrator model's efforts plus a provider-default option", () => {
    render(
      <SettingsTab
        orchestration={makeOrchestration('openrouter/moonshotai/kimi-k3')}
        onUpdate={() => {}}
      />
    )
    const select = effortSelect()
    expect(optionValues(select)).toEqual(['', 'low', 'high'])
    expect(select.options[0].textContent).toBe('Default (model decides)')
  })

  it('clears a saved effort the newly selected model does not support, and saves it cleared', async () => {
    render(<SettingsTab orchestration={makeOrchestration('gpt-5', 'minimal')} onUpdate={() => {}} />)
    expect(effortSelect().value).toBe('minimal')

    fireEvent.change(screen.getByLabelText('Orchestrator model'), {
      target: { value: 'claude-sonnet-5-5' },
    })
    await waitFor(() => expect(effortSelect().value).toBe(''))
    expect(optionValues(effortSelect())).toEqual(['', 'low', 'medium', 'high'])

    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    const body = updateSpy.mock.calls[0][3]
    expect(body.settings.model).toBe('claude-sonnet-5-5')
    expect(body.settings.orchestrator_config).toEqual({ keep: true })
  })

  it('hides the control for a non-reasoning orchestrator model', () => {
    render(<SettingsTab orchestration={makeOrchestration('gpt-4.1', 'high')} onUpdate={() => {}} />)
    expect(screen.queryByText('Reasoning effort')).not.toBeInTheDocument()
  })

  it('offers the full generic ladder for an off-catalog model and keeps its saved effort', () => {
    render(
      <SettingsTab orchestration={makeOrchestration('my-custom-model', 'medium')} onUpdate={() => {}} />
    )
    const select = effortSelect()
    expect(optionValues(select)).toEqual(['', 'minimal', 'low', 'medium', 'high'])
    expect(select.value).toBe('medium')
  })
})
