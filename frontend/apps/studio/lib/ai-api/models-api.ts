import { api, API_URL, settingsApi, type SettingsResponse } from '@/lib/ai-api'
import { IS_PLATFORM } from '@/lib/constants'

export interface ModelInfo {
  id: string
  display_name: string
  provider: string
  tier: string
  recommended: boolean
  available: boolean
  context_window: number | null
  unavailable_reason: string | null
  /** Whether this model supports an extended-reasoning / thinking budget. */
  supports_reasoning: boolean
  /**
   * Valid `reasoning_effort` options for this model (empty for non-reasoning
   * models). gpt-5 family additionally supports "minimal".
   */
  reasoning_efforts: string[]
}

export interface ProviderInfo {
  name: string
  display_name: string
  key_configured: boolean
}

export interface ModelsResponse {
  models: ModelInfo[]
  providers: ProviderInfo[]
}

/** Best-effort provider inference from a bare model id (self-host only). */
function inferProvider(id: string): string {
  if (id.includes('/')) return id.split('/', 1)[0]
  if (id.startsWith('claude')) return 'anthropic'
  if (/^(gpt|o1|o3|o4|chatgpt|text-embedding|davinci|babbage)/.test(id)) return 'openai'
  return 'unknown'
}

/**
 * Self-host has no control-plane `/organizations/{org}/models` endpoint (the OSS
 * project-api returns 404 for it — verified). The authoritative list of models
 * the backend actually accepts is the union of the `llm_model` choice-sets in
 * GET /api/settings, so we source the catalog from there and synthesise the
 * minimal ModelInfo the pickers need. The rich control-plane metadata
 * (tier, reasoning support, AI-on-us availability) is a platform-billing concern
 * that does not exist off-platform, so it degrades to neutral defaults: every
 * model lands in one selectable "balanced" group with no reasoning sub-dropdown.
 */
function modelsFromSettings(settings: SettingsResponse): ModelInfo[] {
  const ids = new Set<string>()
  for (const cat of Object.values(settings.categories ?? {})) {
    for (const s of cat.settings ?? []) {
      if (s.subcategory === 'llm_model' && Array.isArray(s.choices)) {
        for (const c of s.choices) ids.add(c)
      }
    }
  }
  return Array.from(ids)
    .sort()
    .map((id) => ({
      id,
      display_name: id,
      provider: inferProvider(id),
      tier: 'balanced', // must be one of the picker's rendered tiers to appear
      recommended: false,
      available: true,
      context_window: null,
      unavailable_reason: null,
      supports_reasoning: false,
      reasoning_efforts: [],
    }))
}

export const modelsApi = {
  list: (token: string, orgSlug: string): Promise<ModelsResponse> => {
    if (!IS_PLATFORM) {
      // Single-project stack: ref is always 'default'; projectApi routes this
      // same-origin through the self-host proxy (service_role injected server-side).
      return settingsApi
        .getAll(token, 'default')
        .then((settings) => ({ models: modelsFromSettings(settings), providers: [] }))
    }
    return api<ModelsResponse>(`${API_URL}/organizations/${orgSlug}/models`, { token })
  },
}
