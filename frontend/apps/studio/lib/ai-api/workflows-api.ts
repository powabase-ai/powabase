import { projectApi } from '../ai-api'
import type { ListParams } from '../ai-api'
import { buildListQuery } from '../ai-api'

// ── Types ──────────────────────────────────────────────────────────────

export interface Workflow {
  id: string
  name: string
  description: string | null
  version: number
  variables: Record<string, unknown> | null
  color: string | null
  state: 'internal' | 'deployed'
  schedule_config: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface WorkflowListItem extends Workflow {
  execution_count: number
  last_execution_at: string | null
}

export interface WorkflowListResponse {
  items: WorkflowListItem[]
  total: number
  limit: number
  offset: number
}

export interface WorkflowBlock {
  id: string
  type: string
  name: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  enabled: boolean
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle: string | null
  targetHandle: string | null
  condition: string | null
}

export interface WorkflowDetail extends Workflow {
  blocks: WorkflowBlock[]
  edges: WorkflowEdge[]
}

export interface BlockLog {
  block_id: string
  block_type: string
  block_name: string
  status: 'success' | 'error' | 'skipped'
  duration_ms: number | null
  config_snapshot: Record<string, unknown>
  output: unknown
  input?: Record<string, unknown>
  error?: string | null
  execution_order: number
  agent_run_id?: string | null
}

export interface WorkflowExecution {
  id: string
  status: string
  input: Record<string, unknown>
  output: unknown
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string | null
}

// ── API ────────────────────────────────────────────────────────────────

export const workflowsApi = {
  list: async (
    token: string,
    ref: string,
    params: ListParams = {},
    signal?: AbortSignal,
  ): Promise<WorkflowListResponse> => {
    const path = `/workflows${buildListQuery(params)}`
    const data = await projectApi<{
      workflows: WorkflowListItem[]
      total: number
      limit: number
      offset: number
    }>(token, ref, path, { signal })
    return {
      items: data.workflows,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
    }
  },

  create: (token: string, ref: string, data: { name: string; description?: string }) =>
    projectApi<{ id: string; name: string }>(token, ref, '/workflows', {
      method: 'POST',
      body: data,
    }),

  get: (token: string, ref: string, workflowId: string) =>
    projectApi<WorkflowDetail>(token, ref, `/workflows/${workflowId}`),

  update: (
    token: string,
    ref: string,
    workflowId: string,
    data: { name?: string; description?: string }
  ) =>
    projectApi<{ ok: boolean }>(token, ref, `/workflows/${workflowId}`, {
      method: 'PATCH',
      body: data,
    }),

  delete: (token: string, ref: string, workflowId: string) =>
    projectApi<void>(token, ref, `/workflows/${workflowId}`, { method: 'DELETE' }),

  saveGraph: (
    token: string,
    ref: string,
    workflowId: string,
    graph: { blocks: unknown[]; edges: unknown[] }
  ) =>
    projectApi<{ ok: boolean; blocks: number; edges: number }>(
      token,
      ref,
      `/workflows/${workflowId}/graph`,
      { method: 'PUT', body: graph }
    ),

  execute: (
    token: string,
    ref: string,
    workflowId: string,
    variables?: Record<string, unknown>
  ) =>
    projectApi<{
      execution_id: string
      status: string
      output: unknown
      block_outputs: Record<string, unknown>
      block_logs?: BlockLog[]
    }>(token, ref, `/workflows/${workflowId}/execute`, {
      method: 'POST',
      body: { variables },
    }),

  listExecutions: (token: string, ref: string, workflowId: string) =>
    projectApi<{ executions: WorkflowExecution[] }>(
      token,
      ref,
      `/workflows/${workflowId}/executions`
    ),

  getExecutionLogs: (
    token: string,
    ref: string,
    workflowId: string,
    executionId: string
  ) =>
    projectApi<{ block_logs: BlockLog[] }>(
      token,
      ref,
      `/workflows/${workflowId}/executions/${executionId}/logs`
    ),

  deploy: (token: string, ref: string, workflowId: string) =>
    projectApi<{ ok: boolean; state: string }>(token, ref, `/workflows/${workflowId}/deploy`, {
      method: 'POST',
    }),

  undeploy: (token: string, ref: string, workflowId: string) =>
    projectApi<{ ok: boolean; state: string }>(token, ref, `/workflows/${workflowId}/undeploy`, {
      method: 'POST',
    }),

  arm: (token: string, ref: string, workflowId: string) =>
    projectApi<{ ok: boolean; armed_until: string }>(token, ref, `/workflows/${workflowId}/arm`, {
      method: 'POST',
    }),
}
