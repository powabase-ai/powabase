import { api, API_URL } from '@/lib/ai-api'

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

export const modelsApi = {
  list: (token: string, orgSlug: string) =>
    api<ModelsResponse>(`${API_URL}/organizations/${orgSlug}/models`, { token }),
}
