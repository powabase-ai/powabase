import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'common'
import { projectApi } from '@/lib/ai-api'
import { useProjectSupabaseClient } from '@/hooks/ai/useProjectSupabaseClient'
import { llmProviderKeysKeys } from './keys'
import type { LLMProviderKey } from './llm-provider-keys-query'

interface DeleteKeyVariables {
  provider: LLMProviderKey['provider']
}

export function useLLMProviderKeyDeleteMutation() {
  const { ref } = useParams()
  const { token } = useProjectSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ provider }: DeleteKeyVariables) => {
      if (!ref) throw new Error('Missing ref')
      return projectApi<void>(token, ref as string, `/ai-provider-keys/${provider}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llmProviderKeysKeys.list(ref as string) })
    },
  })
}
