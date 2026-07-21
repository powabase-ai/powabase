import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { render } from '@/tests/helpers'

import { ModelSelector, LITELLM_PRICED_PROVIDERS } from './ModelSelector'

// Stub the hooks the component normally pulls from the auth/query layer. Tests
// can either pass overrides via props (preferred for the badge behavior tests)
// or rely on the defaults below. The native <select>-based component renders
// every option synchronously once models load; we patch the data sources so
// tests don't need a real backend or token.

vi.mock('@/hooks/ai/useProjectSupabaseClient', () => ({
  useProjectSupabaseClient: () => ({ token: 'fake-token', orgSlug: 'org-1' }),
}))

vi.mock('@/data/llm-provider-keys/llm-provider-keys-query', () => ({
  useLLMProviderKeysQuery: () => ({ data: [], isLoading: false }),
}))

// Synchronous list so the component renders all options on first paint —
// avoids the loading branch and keeps the assertion path simple.
vi.mock('@/lib/ai-api/models-api', async () => {
  const actual = await vi.importActual<any>('@/lib/ai-api/models-api')
  return {
    ...actual,
    modelsApi: {
      list: vi.fn().mockResolvedValue({
        models: [
          {
            id: 'anthropic/claude-sonnet-4-6',
            display_name: 'Claude Sonnet 4.6',
            provider: 'anthropic',
            tier: 'balanced',
            recommended: false,
            available: true,
            context_window: null,
            unavailable_reason: null,
            supports_reasoning: true,
            reasoning_efforts: ['low', 'medium', 'high'],
          },
          {
            id: 'openrouter/mistralai/mistral-large-2512',
            display_name: 'Mistral Large',
            provider: 'openrouter',
            tier: 'balanced',
            recommended: false,
            available: true,
            context_window: null,
            unavailable_reason: null,
            supports_reasoning: false,
            reasoning_efforts: [],
          },
        ],
        providers: [],
      }),
    },
  }
})

describe('ModelSelector — AI-on-us / BYOK-only badges (Set B)', () => {
  it('renders "AI-on-us" badge for models in BOTH platformProviders AND litellmPricedProviders', async () => {
    render(
      <ModelSelector
        value=""
        onChange={() => {}}
        platformProviders={new Set(['anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    // Wait for the modelsApi.list promise to resolve and options to mount.
    const sonnet = await screen.findByText(/Claude Sonnet 4\.6.*AI-on-us/)
    expect(sonnet).toBeInTheDocument()
  })

  it('renders "BYOK only" badge for models whose provider lacks a platform env key', async () => {
    render(
      <ModelSelector
        value=""
        onChange={() => {}}
        platformProviders={new Set(['anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    const orModel = await screen.findByText(/Mistral Large.*BYOK only/)
    expect(orModel).toBeInTheDocument()
  })

  it('shows no AI-on-us / BYOK-only badges when feature flag is off', async () => {
    render(
      <ModelSelector
        value=""
        onChange={() => {}}
        platformProviders={new Set(['anthropic'])}
        isAiOnUsEnabled={false}
      />
    )
    // Wait for at least one option to mount so we don't false-negative on
    // pre-render assertion.
    await screen.findByText(/Claude Sonnet 4\.6/)
    expect(screen.queryByText(/AI-on-us/)).toBeNull()
    expect(screen.queryByText(/BYOK only/)).toBeNull()
  })

  it('test_ai_on_us_eligible_model_is_selectable_without_byok_key', async () => {
    // Regression for PR 416 C4: with billing:ai_on_us=true AND no BYOK
    // anthropic key, the Claude option must be SELECTABLE (option.disabled
    // === false). Previously _available only checked configuredProviders,
    // so AI-on-us models were rendered disabled — breaking the primary
    // AI-on-us flow.
    render(
      <ModelSelector
        value=""
        onChange={() => {}}
        platformProviders={new Set(['anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    const sonnet = (await screen.findByText(/Claude Sonnet 4\.6/)) as HTMLOptionElement
    // The matched node is the <option>'s text content; the option itself is
    // the closest <option> ancestor.
    const option = sonnet.closest('option') as HTMLOptionElement | null
    expect(option).not.toBeNull()
    expect(option!.disabled).toBe(false)
  })

  it('does not show "add <provider> API key" suffix when model is AI-on-us eligible', async () => {
    // C4 follow-on: the suffix copy must not nag for a BYOK key when the
    // user can use the model via AI-on-us. Asserts the badge logic owns
    // the suffix in that case.
    render(
      <ModelSelector
        value=""
        onChange={() => {}}
        platformProviders={new Set(['anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    const sonnet = await screen.findByText(/Claude Sonnet 4\.6/)
    expect(sonnet.textContent).not.toMatch(/add anthropic API key/)
  })
})

describe('ModelSelector — key-gate removal (post-v1.5)', () => {
  it('no option is rendered disabled, regardless of BYOK / AI-on-us state', async () => {
    render(
      <ModelSelector
        value=""
        onChange={() => {}}
        platformProviders={new Set()}
        isAiOnUsEnabled={false}
      />
    )
    // Wait for at least one option to mount before asserting the set.
    await screen.findByText(/Claude Sonnet 4\.6/)
    const options = Array.from(document.querySelectorAll('option')) as HTMLOptionElement[]
    // Filter out the empty-placeholder option whose value is "".
    const modelOptions = options.filter((o) => o.value !== '')
    expect(modelOptions.length).toBeGreaterThan(0)
    for (const opt of modelOptions) {
      expect(opt.disabled).toBe(false)
    }
  })

  it('renders "will use balance" suffix on a model with neither BYOK nor AI-on-us', async () => {
    // openrouter is in LITELLM_PRICED_PROVIDERS, so to make the openrouter
    // model unavailable we set platformProviders to empty AND keysQuery returns
    // [] (default mock). Then aiOnUs=false; _available is false because neither
    // path qualifies.
    render(
      <ModelSelector
        value=""
        onChange={() => {}}
        platformProviders={new Set()}
        isAiOnUsEnabled={false}
      />
    )
    const orModel = (await screen.findByText(/Mistral Large/)) as HTMLOptionElement
    const option = orModel.closest('option') as HTMLOptionElement | null
    expect(option).not.toBeNull()
    expect(option!.textContent).toMatch(/will use balance/)
  })
})

describe('ModelSelector — out-of-catalog (backend-set) value', () => {
  // Regression: an agent whose `model` was set directly from the backend
  // (e.g. `anthropic/claude-opus-4-7`) to a value not present in the curated
  // /models catalog used to render with NO matching <option>. A native
  // <select> with an unmatched value silently falls back to displaying its
  // first <option> — the top flagship model — so opening the agent config UI
  // made the dropdown read as a different model (e.g. GPT-5.4) and a blind
  // save could clobber the real backend-set model. The selector must instead
  // surface the current value as its own option so it stays selected.
  const OUT_OF_CATALOG = 'anthropic/claude-opus-4-7'

  it('keeps the backend-set value selected instead of defaulting to the first option', async () => {
    render(
      <ModelSelector
        value={OUT_OF_CATALOG}
        onChange={() => {}}
        platformProviders={new Set(['anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    // Wait for the catalog to load (a known option mounts).
    await screen.findByText(/Claude Sonnet 4\.6/)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe(OUT_OF_CATALOG)
  })

  it('renders an <option> for the backend-set value so it is visible in the list', async () => {
    render(
      <ModelSelector
        value={OUT_OF_CATALOG}
        onChange={() => {}}
        platformProviders={new Set(['anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    await screen.findByText(/Claude Sonnet 4\.6/)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const match = Array.from(select.querySelectorAll('option')).find(
      (o) => (o as HTMLOptionElement).value === OUT_OF_CATALOG
    )
    expect(match).toBeTruthy()
  })

  it('does NOT add a synthetic option when the value is already in the catalog', async () => {
    render(
      <ModelSelector
        value="anthropic/claude-sonnet-4-6"
        onChange={() => {}}
        platformProviders={new Set(['anthropic'])}
        isAiOnUsEnabled={true}
      />
    )
    await screen.findByText(/Claude Sonnet 4\.6/)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    const matches = Array.from(select.querySelectorAll('option')).filter(
      (o) => (o as HTMLOptionElement).value === 'anthropic/claude-sonnet-4-6'
    )
    // Exactly one — the catalog option, not a duplicate fallback.
    expect(matches).toHaveLength(1)
  })
})

describe('ModelSelector — LITELLM_PRICED_PROVIDERS constant', () => {
  it('includes the four canonical AI-on-us providers', () => {
    // These are the providers the PS pod ships env-var slots for and that
    // LiteLLM has pricing rows for. Mirror of _PROVIDER_ENV on the backend.
    expect(LITELLM_PRICED_PROVIDERS.has('openai')).toBe(true)
    expect(LITELLM_PRICED_PROVIDERS.has('anthropic')).toBe(true)
    expect(LITELLM_PRICED_PROVIDERS.has('google')).toBe(true)
    expect(LITELLM_PRICED_PROVIDERS.has('openrouter')).toBe(true)
  })
})
