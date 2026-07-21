import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'common'
import { projectApi } from '@/lib/ai-api'
import { useProjectSupabaseClient } from '@/hooks/ai/useProjectSupabaseClient'
import { llmProviderKeysKeys } from './keys'
import type { LLMProviderKey } from './llm-provider-keys-query'

interface CreateKeyVariables {
  provider: LLMProviderKey['provider']
  api_key: string
}

export function useLLMProviderKeyCreateMutation() {
  const { ref } = useParams()
  const { token } = useProjectSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: CreateKeyVariables) => {
      if (!ref) throw new Error('Missing ref')
      return projectApi<LLMProviderKey>(token, ref as string, '/ai-provider-keys', {
        method: 'POST',
        body: vars,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llmProviderKeysKeys.list(ref as string) })
    },
  })
}
