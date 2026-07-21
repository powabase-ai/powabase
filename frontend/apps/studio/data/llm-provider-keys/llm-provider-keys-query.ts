import { useQuery } from '@tanstack/react-query'
import { useParams } from 'common'
import { hasAiAuth, projectApi } from '@/lib/ai-api'
import { useProjectSupabaseClient } from '@/hooks/ai/useProjectSupabaseClient'
import { llmProviderKeysKeys } from './keys'

export interface LLMProviderKey {
  id: string
  provider: 'openai' | 'anthropic' | 'google' | 'openrouter'
  masked_key: string
  is_valid: boolean | null
  last_validated_at: string | null
  created_at: string | null
  updated_at: string | null
}

export function useLLMProviderKeysQuery(options?: { enabled?: boolean }) {
  const { ref } = useParams()
  const { token, isReady } = useProjectSupabaseClient()

  return useQuery<LLMProviderKey[]>({
    queryKey: llmProviderKeysKeys.list(ref),
    queryFn: async () => {
      if (!ref) throw new Error('Missing ref')
      try {
        return await projectApi<LLMProviderKey[]>(token, ref as string, '/ai-provider-keys', {
          method: 'GET',
        })
      } catch (err) {
        // Older project-service containers (provisioned before the
        // ai_provider_keys route shipped) return 404 here. Treat that as
        // "no keys yet" so the dashboard renders cleanly and the user
        // sees the expected "configure provider keys" UI flow instead of
        // a noisy console error. The project must be redeployed against
        // a newer project-service image to actually persist keys.
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
          return []
        }
        throw err
      }
    },
    enabled: options?.enabled !== false && !!ref && isReady && hasAiAuth(token),
    staleTime: 5 * 60 * 1000,
  })
}
