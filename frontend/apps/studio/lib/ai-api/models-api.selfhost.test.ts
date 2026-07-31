import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pins for the self-host model-catalog fix.
//
// Two independent defects made every AI model dropdown permanently unusable on
// self-host:
//   (1) the fetch was gated on raw `!token` (empty off-platform) instead of
//       hasAiAuth(token), and isLoading was never cleared on the early-return,
//       so the <select> hung disabled on "Loading models…";
//   (2) modelsApi.list hit the control-plane-only ${API_URL}/organizations/
//       {org}/models (default http://localhost:5000/api), which the OSS
//       project-api returns 404 for — so even once (1) is fixed the fetch fails.
//
// This file pins (2): the self-host branch must source the catalog from
// GET /api/settings (the authoritative llm_model choice-sets) and NOT touch the
// control-plane URL, while platform mode is unchanged.

const { apiSpy, getAllSpy } = vi.hoisted(() => ({ apiSpy: vi.fn(), getAllSpy: vi.fn() }))

vi.mock('@/lib/ai-api', () => ({
  API_URL: 'http://localhost:5000/api',
  api: apiSpy,
  settingsApi: { getAll: getAllSpy },
}))
vi.mock('@/lib/constants', () => ({ IS_PLATFORM: false }))

const SETTINGS_FIXTURE = {
  categories: {
    agents: {
      label: 'Agents',
      settings: [
        {
          key: 'AGENT_DEFAULT_MODEL',
          label: 'Default model',
          description: '',
          type: 'str',
          default: 'gpt-5.4-mini',
          value: 'gpt-5.4-mini',
          advanced: false,
          subcategory: 'llm_model',
          choices: ['gpt-5.4', 'claude-sonnet-4-6', 'gemini/gemini-2.5-pro'],
        },
        // a non-model setting must be ignored
        { key: 'TEMPERATURE', label: 'Temp', description: '', type: 'float', default: 0.7, value: 0.7, advanced: false },
      ],
    },
    knowledge: {
      label: 'Knowledge',
      settings: [
        {
          key: 'PAGEINDEX_MODEL',
          label: 'PageIndex model',
          description: '',
          type: 'str',
          default: 'gpt-5.4',
          value: 'gpt-5.4',
          advanced: false,
          subcategory: 'llm_model',
          choices: ['gpt-5.4', 'openrouter/meta/llama-4'], // gpt-5.4 dup must dedupe
        },
      ],
    },
  },
}

beforeEach(() => {
  vi.resetModules()
  apiSpy.mockReset()
  getAllSpy.mockReset()
})

describe('modelsApi.list — self-host (IS_PLATFORM=false)', () => {
  it('sources the catalog from settingsApi.getAll and NEVER touches the control-plane URL', async () => {
    getAllSpy.mockResolvedValueOnce(SETTINGS_FIXTURE)
    const { modelsApi } = await import('./models-api')

    const res = await modelsApi.list('', 'org-1')

    // did NOT hit the localhost:5000 control-plane endpoint
    expect(apiSpy).not.toHaveBeenCalled()
    // DID pull from settings, ref pinned to the single-project 'default'
    expect(getAllSpy).toHaveBeenCalledWith('', 'default')

    // deduped + sorted union of every llm_model choice, non-model settings ignored
    const ids = res.models.map((m) => m.id)
    expect(ids).toEqual([
      'claude-sonnet-4-6',
      'gemini/gemini-2.5-pro',
      'gpt-5.4',
      'openrouter/meta/llama-4',
    ])
    // every synthesised model must land in a picker-rendered tier so it appears
    expect(res.models.every((m) => m.tier === 'balanced')).toBe(true)
    // provider inference (drives badges only; must be best-effort, never crash)
    const byId = Object.fromEntries(res.models.map((m) => [m.id, m.provider]))
    expect(byId['claude-sonnet-4-6']).toBe('anthropic')
    expect(byId['gpt-5.4']).toBe('openai')
    expect(byId['gemini/gemini-2.5-pro']).toBe('gemini')
    expect(byId['openrouter/meta/llama-4']).toBe('openrouter')
  })
})

describe('modelsApi.list — platform (IS_PLATFORM=true)', () => {
  it('is unchanged: hits ${API_URL}/organizations/{org}/models with the bearer token', async () => {
    vi.doMock('@/lib/ai-api', () => ({
      API_URL: 'http://cp-backend.test/api',
      api: apiSpy,
      settingsApi: { getAll: getAllSpy },
    }))
    vi.doMock('@/lib/constants', () => ({ IS_PLATFORM: true }))
    apiSpy.mockResolvedValueOnce({ models: [], providers: [] })
    const { modelsApi } = await import('./models-api')

    await modelsApi.list('a-real-jwt', 'abcdef')

    expect(getAllSpy).not.toHaveBeenCalled()
    expect(apiSpy).toHaveBeenCalledWith('http://cp-backend.test/api/organizations/abcdef/models', {
      token: 'a-real-jwt',
    })
  })
})
