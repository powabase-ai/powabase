import { useQuery } from '@tanstack/react-query'
import { useParams } from 'common'

import { workflowKeys } from './keys'
import { useSessionAccessTokenQuery } from '@/data/auth/session-access-token-query'
import { hasAiAuth } from '@/lib/ai-api'
import { workflowsApi } from '@/lib/ai-api/workflows-api'

export function useWorkflowsListQuery() {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()

  return useQuery({
    queryKey: workflowKeys.list(ref),
    queryFn: async () => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      // Back-compat shape: callers (dropdowns etc.) expect `.workflows`.
      // workflowsApi.list now returns `{ items, total, limit, offset }`;
      // alias items → workflows here so this hook's shape is unchanged.
      // Self-host: token is legitimately '' | null | undefined here —
      // hasAiAuth (not a type predicate) already proved that's OK; the
      // proxy injects the real credential.
      const result = await workflowsApi.list(token!, ref)
      return {
        workflows: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      }
    },
    enabled: hasAiAuth(token) && !!ref,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })
}

export function useWorkflowDetailQuery(workflowId: string) {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()

  return useQuery({
    queryKey: workflowKeys.detail(ref, workflowId),
    queryFn: async () => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return workflowsApi.get(token!, ref, workflowId)
    },
    enabled: hasAiAuth(token) && !!ref && !!workflowId,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })
}

export function useWorkflowExecutionsQuery(
  workflowId: string,
  options?: { refetchInterval?: number | false }
) {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()

  return useQuery({
    queryKey: workflowKeys.executions(ref, workflowId),
    queryFn: async () => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return workflowsApi.listExecutions(token!, ref, workflowId)
    },
    enabled: hasAiAuth(token) && !!ref && !!workflowId,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: options?.refetchInterval,
  })
}

export function useExecutionBlockLogsQuery(
  workflowId: string,
  executionId: string | null,
  options?: { refetchInterval?: number | false }
) {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()

  return useQuery({
    queryKey: workflowKeys.blockLogs(ref, executionId ?? ''),
    queryFn: async () => {
      if (!hasAiAuth(token) || !ref || !executionId) {
        throw new Error('Missing authentication or project ref')
      }
      return workflowsApi.getExecutionLogs(token!, ref, workflowId, executionId)
    },
    enabled: hasAiAuth(token) && !!ref && !!workflowId && !!executionId,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: options?.refetchInterval,
  })
}
