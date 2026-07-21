import { useQuery } from "@tanstack/react-query"
import { useParams } from 'common'
import { hasAiAuth, settingsApi, SettingsResponse } from "@/lib/ai-api"
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient"
import { settingsKeys } from "./keys"

export function useProjectSettingsQuery(options?: { enabled?: boolean }) {
  const { ref } = useParams()
  const { token, isReady } = useProjectSupabaseClient()

  return useQuery<SettingsResponse>({
    queryKey: settingsKeys.list(ref),
    queryFn: async () => {
      if (!ref) throw new Error("Missing ref")
      return settingsApi.getAll(token, ref as string)
    },
    enabled: options?.enabled !== false && !!ref && isReady && hasAiAuth(token),
    staleTime: 5 * 60 * 1000,
  })
}
