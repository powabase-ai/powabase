import { useQuery } from '@tanstack/react-query'
import { useParams } from 'common'

import { useProjectSupabaseClient } from '@/hooks/ai/useProjectSupabaseClient'
import { hasAiAuth, projectApi } from '@/lib/ai-api'

import { llmProviderKeysKeys } from './keys'

export interface PlatformSupportedResponse {
  providers: string[]
}

/**
 * Returns the providers AI-on-us is available for at this PS pod.
 *
 * Two-factor AI-on-us rule (credit-system v1.5): provider P is
 * AI-on-us-available iff (1) P is in LiteLLM's pricing JSON AND
 * (2) the pod env carries a platform key for P. Factor (1) is implicit
 * in the backend's ``_PROVIDER_ENV`` allowlist; this query surfaces
 * factor (2).
 *
 * Older project-service containers (pre-v1.5) don't expose this endpoint;
 * we fall back to an empty list so the Settings page renders cleanly as
 * "BYOK required" everywhere instead of error chrome.
 */
export function useLLMPlatformSupportedQuery(options?: { enabled?: boolean }) {
  const { ref } = useParams()
  const { token, isReady } = useProjectSupabaseClient()

  return useQuery<PlatformSupportedResponse>({
    queryKey: llmProviderKeysKeys.platformSupported(ref),
    queryFn: async () => {
      if (!ref) throw new Error('Missing ref')
      try {
        return await projectApi<PlatformSupportedResponse>(
          token,
          ref as string,
          '/ai-provider-keys/platform_supported',
          { method: 'GET' }
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
          return { providers: [] }
        }
        throw err
      }
    },
    enabled: options?.enabled !== false && !!ref && isReady && hasAiAuth(token),
    staleTime: 5 * 60 * 1000,
  })
}
