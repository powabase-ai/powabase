import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from 'common'
import { settingsApi } from "@/lib/ai-api"
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient"
import { settingsKeys } from "./keys"

export function useUpdateSettingsMutation() {
  const { ref } = useParams()
  const { token } = useProjectSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      if (!ref) throw new Error("Missing ref")
      return settingsApi.update(token, ref as string, settings)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all })
    },
  })
}

export function useResetSettingMutation() {
  const { ref } = useParams()
  const { token } = useProjectSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (key: string) => {
      if (!ref) throw new Error("Missing ref")
      return settingsApi.resetKey(token, ref as string, key)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all })
    },
  })
}

export function useResetCategoryMutation() {
  const { ref } = useParams()
  const { token } = useProjectSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (category: string) => {
      if (!ref) throw new Error("Missing ref")
      return settingsApi.resetCategory(token, ref as string, category)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all })
    },
  })
}
