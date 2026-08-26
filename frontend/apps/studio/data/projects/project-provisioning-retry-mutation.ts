import { useMutation, useQueryClient } from '@tanstack/react-query'

import { constructHeaders } from '@/data/fetchers'
import { projectKeys } from '@/data/projects/keys'
import { useInvalidateProjectsInfiniteQuery } from '@/data/projects/org-projects-infinite-query'
import { API_URL } from '@/lib/constants'

export class ProvisioningRetryError extends Error {
  constructor(
    message: string,
    public readonly code: number
  ) {
    super(message)
    this.name = 'ProvisioningRetryError'
  }
}

/**
 * Re-run a failed project set-up. The platform answers 202 while the project
 * is waiting in its failed state and 409 `not_retryable` once it has moved
 * on; both mean "re-read the project", so detail, status and the org list are
 * refetched either way. The body is `{}` on purpose: leaving `ai_provider_keys`
 * out keeps the provider keys staged when the project was created.
 */
export const useProjectProvisioningRetryMutation = () => {
  const qc = useQueryClient()
  const { invalidateProjectsQuery } = useInvalidateProjectsInfiniteQuery()
  return useMutation<unknown, ProvisioningRetryError, { ref: string }>({
    mutationFn: async ({ ref }) => {
      const res = await fetch(`${API_URL}/platform/projects/${ref}/provisioning/retry`, {
        method: 'POST',
        headers: await constructHeaders({ 'Content-Type': 'application/json' }),
        body: '{}',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new ProvisioningRetryError(body.error ?? `retry failed: ${res.status}`, res.status)
      }
      return res.json()
    },
    onSettled: async (_data, _error, { ref }) => {
      // Awaited on purpose: the mutation stays pending — and the Retry button
      // disabled — until the active detail/status refetches and the list
      // invalidation have completed (the list is usually inactive here and is
      // only marked stale, so this resolves as soon as the detail is back).
      await Promise.all([
        qc.invalidateQueries({ queryKey: projectKeys.detail(ref) }),
        qc.invalidateQueries({ queryKey: projectKeys.status(ref) }),
        invalidateProjectsQuery(),
      ])
    },
  })
}
