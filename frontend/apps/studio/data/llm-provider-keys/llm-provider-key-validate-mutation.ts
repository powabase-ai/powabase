import { useMutation } from '@tanstack/react-query'
import { useParams } from 'common'
import { projectApi } from '@/lib/ai-api'
import { useProjectSupabaseClient } from '@/hooks/ai/useProjectSupabaseClient'
import type { LLMProviderKey } from './llm-provider-keys-query'

interface ValidateKeyVariables {
  provider: LLMProviderKey['provider']
  api_key: string
}

interface ValidateKeyResult {
  is_valid: boolean
  error?: string
}

export function useLLMProviderKeyValidateMutation() {
  const { ref } = useParams()
  const { token } = useProjectSupabaseClient()

  return useMutation({
    mutationFn: async (vars: ValidateKeyVariables) => {
      if (!ref) throw new Error('Missing ref')
      return projectApi<ValidateKeyResult>(token, ref as string, '/ai-provider-keys/validate', {
        method: 'POST',
        body: vars,
      })
    },
    // No cache invalidation — validate is read-only
  })
}
