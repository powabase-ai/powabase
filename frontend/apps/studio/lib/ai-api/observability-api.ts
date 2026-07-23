import { projectApi } from '../ai-api'

/**
 * Client for the backend's observability routes — the /observability
 * dashboard's data source now that direct ai-schema PostgREST access is
 * gone (C2.1). Every function is a thin proxy over a bounded, filtered
 * SELECT; the six
 * data/observability/*.ts hooks keep doing their own client-side
 * bucketing/percentile/tally aggregation on the returned rows unchanged.
 */

export interface ObservabilityAgentRunRow {
  id: string
  status: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  error: string | null
  model: string | null
  agent_id: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  reasoning_tokens: number | null
  total_tokens: number | null
}

export interface ObservabilityOrchestrationRunRow {
  id: string
  created_at: string | null
  status: string | null
  model: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  reasoning_tokens: number | null
  total_tokens: number | null
}

export interface ObservabilityWorkflowBlockLogRow {
  id: string
  created_at: string | null
  status: string | null
  block_type: string
  model: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  reasoning_tokens: number | null
  total_tokens: number | null
}

export interface ObservabilityToolCallRow {
  tool_name: string
  status: 'success' | 'error'
  duration_ms: number | null
  agent_id: string | null
  model: string | null
  occurred_at: string | null
}

export interface ObservabilityAgentLookupItem {
  id: string
  name: string | null
}

export interface ObservabilityHealth {
  activeRuns: number
  failedRuns24h: number
  stuckExtractions: number
  failedIndexedSources: number
  runningWorkflows: number
}

interface WindowParams {
  since: string
  until?: string
  models?: string[]
  agentIds?: string[]
  limit?: number
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

function windowQuery(params: WindowParams): string {
  return buildQuery({
    since: params.since,
    until: params.until,
    models: params.models?.length ? params.models.join(',') : undefined,
    agent_ids: params.agentIds?.length ? params.agentIds.join(',') : undefined,
    limit: params.limit,
  })
}

export const observabilityApi = {
  listAgentRuns: (token: string, ref: string, params: WindowParams) =>
    projectApi<{ runs: ObservabilityAgentRunRow[]; truncated: boolean }>(
      token, ref, `/observability/agent-runs${windowQuery(params)}`,
    ),

  listOrchestrationRuns: (
    token: string, ref: string, params: Omit<WindowParams, 'agentIds'>,
  ) =>
    projectApi<{ runs: ObservabilityOrchestrationRunRow[]; truncated: boolean }>(
      token, ref, `/observability/orchestration-runs${windowQuery(params)}`,
    ),

  listWorkflowBlockLogs: (
    token: string, ref: string, params: Omit<WindowParams, 'agentIds'>,
  ) =>
    projectApi<{ logs: ObservabilityWorkflowBlockLogRow[]; truncated: boolean }>(
      token, ref, `/observability/workflow-block-logs${windowQuery(params)}`,
    ),

  listToolCalls: (token: string, ref: string, params: WindowParams) =>
    projectApi<{ events: ObservabilityToolCallRow[]; truncated: boolean }>(
      token, ref, `/observability/tool-calls${windowQuery(params)}`,
    ),

  getExtractionStatus: (token: string, ref: string) =>
    projectApi<{
      sources: { extraction_status: string | null }[]
      indexed_sources: { index_status: string | null }[]
    }>(token, ref, '/observability/extraction-status'),

  getFilterOptions: (token: string, ref: string) =>
    projectApi<{ models: string[]; agents: ObservabilityAgentLookupItem[] }>(
      token, ref, '/observability/filter-options',
    ),

  getAgentsLookup: (token: string, ref: string, ids: string[]) => {
    if (ids.length === 0) return Promise.resolve({ agents: [] as ObservabilityAgentLookupItem[] })
    return projectApi<{ agents: ObservabilityAgentLookupItem[] }>(
      token, ref, `/observability/agents-lookup${buildQuery({ ids: ids.join(',') })}`,
    )
  },

  getHealth: (token: string, ref: string) =>
    projectApi<ObservabilityHealth>(token, ref, '/observability/health'),
}
