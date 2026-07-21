import { useMutation, useQueryClient } from '@tanstack/react-query'

import { constructHeaders } from '@/data/fetchers'
import { projectKeys } from '@/data/projects/keys'
import { API_URL } from '@/lib/constants'

export const useProjectResumeMutation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ref }: { ref: string }) => {
      const res = await fetch(`${API_URL}/platform/projects/${ref}/resume`, {
        method: 'POST',
        headers: await constructHeaders({ 'Content-Type': 'application/json' }),
      })
      if (!res.ok) throw new Error(`resume failed: ${res.status} ${await res.text()}`)
      return res.json()
    },
    onSuccess: (_d, { ref }) => qc.invalidateQueries({ queryKey: projectKeys.detail(ref) }),
  })
}
