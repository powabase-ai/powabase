import { projectApi } from '../ai-api'
import type { ListParams } from '../ai-api'
import { buildListQuery } from '../ai-api'
import type { AgentHook } from './agents-api'

export interface Orchestration {
  id: string
  name: string
  description: string | null
  strategy: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OrchestrationListItem extends Orchestration {
  entity_count: number
  session_count: number
  last_run_at: string | null
}

export interface OrchestrationListResponse {
  items: OrchestrationListItem[]
  total: number
  limit: number
  offset: number
}

export interface OrchestrationEntity {
  id: string
  orchestration_id: string
  entity_type: 'agent' | 'tool'
  entity_ref_id: string
  role_description: string | null
  position: number | null
  config: Record<string, unknown>
  created_at: string
  agent_name?: string
  tool_name?: string
  tool_count?: number
}

export interface OrchestrationSession {
  session_id: string
  run_count: number
  first_message: string | null
  last_activity_at: string | null
  created_at: string | null
}

export const orchestrationsApi = {
  list: async (
    token: string,
    ref: string,
    params: ListParams = {},
    signal?: AbortSignal,
  ): Promise<OrchestrationListResponse> => {
    const path = `/orchestrations${buildListQuery(params)}`
    const data = await projectApi<{
      orchestrations: OrchestrationListItem[]
      total?: number
      limit?: number
      offset?: number
    }>(token, ref, path, { signal })

    // Back-compat: if caller sent no pagination params, the server omits
    // total/limit/offset. Synthesize them as a single full page so
    // usePaginatedList sees hasNextPage = false.
    const synthesized = data.total === undefined
    return {
      items: data.orchestrations,
      total: synthesized ? data.orchestrations.length : data.total!,
      limit: synthesized ? data.orchestrations.length : data.limit!,
      offset: synthesized ? 0 : data.offset!,
    }
  },

  create: (
    token: string,
    ref: string,
    data: {
      name: string
      description?: string
      strategy: string
      settings?: Record<string, unknown>
    }
  ) => projectApi<Orchestration>(token, ref, '/orchestrations', { method: 'POST', body: data }),

  get: (token: string, ref: string, orchId: string) =>
    projectApi<Orchestration>(token, ref, `/orchestrations/${orchId}`),

  update: (
    token: string,
    ref: string,
    orchId: string,
    data: Partial<{
      name: string
      description: string
      strategy: string
      settings: Record<string, unknown>
    }>
  ) =>
    projectApi<Orchestration>(token, ref, `/orchestrations/${orchId}`, {
      method: 'PUT',
      body: data,
    }),

  delete: (token: string, ref: string, orchId: string) =>
    projectApi<void>(token, ref, `/orchestrations/${orchId}`, { method: 'DELETE' }),

  // ── Entities ────────────────────────────────────────────────────────

  listEntities: (token: string, ref: string, orchId: string) =>
    projectApi<{ entities: OrchestrationEntity[] }>(
      token,
      ref,
      `/orchestrations/${orchId}/entities`
    ),

  addEntity: (
    token: string,
    ref: string,
    orchId: string,
    data: {
      entity_type: string
      entity_ref_id: string
      role_description?: string
      position?: number
      config?: Record<string, unknown>
    }
  ) =>
    projectApi<OrchestrationEntity>(token, ref, `/orchestrations/${orchId}/entities`, {
      method: 'POST',
      body: data,
    }),

  updateEntity: (
    token: string,
    ref: string,
    orchId: string,
    entityId: string,
    data: Partial<{ role_description: string; position: number; config: Record<string, unknown> }>
  ) =>
    projectApi<OrchestrationEntity>(
      token,
      ref,
      `/orchestrations/${orchId}/entities/${entityId}`,
      { method: 'PUT', body: data }
    ),

  removeEntity: (token: string, ref: string, orchId: string, entityId: string) =>
    projectApi<void>(token, ref, `/orchestrations/${orchId}/entities/${entityId}`, {
      method: 'DELETE',
    }),

  // ── Hooks ───────────────────────────────────────────────────────────

  listHooks: (token: string, ref: string, orchId: string) =>
    projectApi<{ hooks: AgentHook[] }>(token, ref, `/orchestrations/${orchId}/hooks`),

  addHook: (
    token: string,
    ref: string,
    orchId: string,
    data: {
      event: string
      matcher?: string
      type: string
      config: Record<string, unknown>
    }
  ) =>
    projectApi<AgentHook>(token, ref, `/orchestrations/${orchId}/hooks`, {
      method: 'POST',
      body: data,
    }),

  removeHook: (token: string, ref: string, orchId: string, hookId: string) =>
    projectApi<{ deleted: boolean }>(
      token,
      ref,
      `/orchestrations/${orchId}/hooks/${hookId}`,
      { method: 'DELETE' }
    ),

  // ── Sessions ────────────────────────────────────────────────────────

  listSessions: (token: string, ref: string, orchId: string) =>
    projectApi<{ sessions: OrchestrationSession[]; total: number }>(
      token,
      ref,
      `/orchestrations/${orchId}/sessions`
    ),

  getSessionMessages: (token: string, ref: string, orchId: string, sessionId: string) =>
    projectApi<{
      session_id: string
      messages: Array<{
        role: string
        content: string
        run_id?: string
        /**
         * Per-message tool-call records hydrated from `ai.tool_call_events`
         * for the delegated child agent_runs of this orchestration run.
         * Order matches event ordering inside the nested delegation
         * envelopes, so `buildTraceTree`'s tool_name + order-of-appearance
         * enrichment lines up. Each `result` carries the full payload
         * including multimodal blocks (image refs already resolved to
         * inline base64 data URLs).
         */
        tool_calls?: Array<{
          step: number
          tool_name: string
          arguments: Record<string, unknown> | string | unknown[]
          result: string | unknown[] | Record<string, unknown>
          duration_ms: number
        }>
      }>
      events?: Array<{ type: string; [key: string]: unknown }>
      /**
       * Flattened tool_calls across all orchestration runs in this session.
       * Kept for back-compat with the legacy single-trace path that maps
       * the flat `data.events` to the last assistant run_id. New code
       * should read tool_calls per-message.
       */
      tool_calls?: Array<{
        step: number
        tool_name: string
        arguments: Record<string, unknown> | string | unknown[]
        result: string | unknown[] | Record<string, unknown>
        duration_ms: number
      }>
    }>(token, ref, `/orchestrations/${orchId}/sessions/${sessionId}/messages`),
}
