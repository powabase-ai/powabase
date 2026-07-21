import { useMutation, useQueryClient } from '@tanstack/react-query'

import { constructHeaders } from '@/data/fetchers'
import { projectKeys } from '@/data/projects/keys'
import { API_URL } from '@/lib/constants'

export const useResizeComputeMutation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ref, computeSizeId }: { ref: string; computeSizeId: string }) => {
      const res = await fetch(`${API_URL}/platform/projects/${ref}/compute-tier`, {
        method: 'POST',
        headers: await constructHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ compute_size_id: computeSizeId }),
      })
      if (!res.ok) throw new Error(`resize failed: ${res.status} ${await res.text()}`)
      // 202 (async resize timeout) is OK — the reconciler completes-forward; the
      // project page then polls compute_size_id until it flips.
      return res.status === 202 ? { status: 'resizing' } : await res.json()
    },
    // Invalidate the project detail so the header re-fetches the (still-OLD on
    // 202) compute_size_id and starts/continues its "Resizing…" poll.
    onSuccess: (_d, { ref }) => qc.invalidateQueries({ queryKey: projectKeys.detail(ref) }),
  })
}
