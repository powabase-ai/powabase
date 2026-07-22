import { aiAuthHeader, projectApi, projectApiUrl, SessionExpiredError } from '../ai-api'
import type { StreamRunEvent } from '../ai-api'

/**
 * Display-truncate a run id. Handles three shapes defensively:
 *   - UUID:              "a1b2c3d4-..."        -> "a1b2c3d4"
 *   - wfblk_ prefixed:   "wfblk_abc123def456"  -> "abc123de"
 *   - delegate_ prefixed: "delegate_abc123..." -> "abc123.."
 * Falls back to "—" when the id is missing.
 */
export function truncateRunId(runId: string | null | undefined): string {
  if (!runId) return '—'
  const lastUnderscore = runId.lastIndexOf('_')
  const tail = lastUnderscore >= 0 ? runId.slice(lastUnderscore + 1) : runId
  return tail.slice(0, 8)
}

export interface AgentRunDetail {
  id: string
  agent_id: string | null
  status: string
  content: string | null
  input_messages: Array<{ role: string; content: string }> | null
  output_messages: Array<{ role: string; content: string }> | null
  usage: Record<string, number> | null
  started_at: string | null
  completed_at: string | null
}

/**
 * Tool-call record as returned by the project-service run detail APIs.
 * `result` may be a plain string OR a list of multimodal content blocks
 * (e.g. `[{type: "text", text: "..."}, {type: "image_url", image_url: {url: "..."}}]`)
 * when an agent uses a tool that returns multimodal data such as
 * `knowledge_search` against an image-mode KB.
 */
export interface ToolCallDetail {
  step: number
  tool_name: string
  arguments: Record<string, unknown> | string | unknown[]
  result: string | unknown[] | Record<string, unknown>
  duration_ms: number
}

export interface OrchestrationRun {
  id: string
  orchestration_id: string
  status: string
  input: string
  content: string | null
  error: string | null
  usage: Record<string, number> | null
  /** Supervisor / orchestrator model. NULL on legacy rows or non-supervisor strategies. */
  model?: string | null
  events: Array<Record<string, unknown>>
  started_at: string | null
  completed_at: string | null
  child_runs?: Array<{
    run_id: string
    status: string
    steps?: number
    content: string | null
    usage: Record<string, number> | null
    /** Per-child agent's model. */
    model?: string | null
    events?: Array<Record<string, unknown>>
    /**
     * Hydrated from `ai.tool_call_events` for this child agent's run.
     * Each `result` carries the full payload — including multimodal blocks
     * (`image_url`, `image_ref`, `text`) — so MultimodalOutput can render
     * them instead of the truncated `[multimodal content]` preview.
     */
    tool_calls?: ToolCallDetail[]
  }>
}

export const runsApi = {
  approve: (
    token: string,
    ref: string,
    runId: string,
    data: { approved: boolean; reason?: string }
  ) =>
    projectApi<{ status: string }>(token, ref, `/agents/runs/${runId}/approve`, {
      method: 'POST',
      body: data,
    }),

  getOrchestrationRun: (token: string, ref: string, runId: string) =>
    projectApi<OrchestrationRun>(token, ref, `/orchestrations/runs/${runId}`),

  getAgentRun: (token: string, ref: string, runId: string) =>
    projectApi<AgentRunDetail>(token, ref, `/agents/runs/${runId}`),
}

/**
 * Stream orchestration run via POST (SSE) - proxied through platform.
 */
export async function streamOrchestrationRun(
  token: string,
  ref: string,
  orchId: string,
  body: { message: string; session_id?: string },
  onEvent: (event: StreamRunEvent) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...aiAuthHeader(token),
  }
  const response = await fetch(
    projectApiUrl(ref, `/orchestrations/${orchId}/run/stream`),
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    }
  )
  if (response.status === 401) {
    throw new SessionExpiredError()
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || 'Stream request failed')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim()
          if (raw === '[DONE]' || !raw) continue
          try {
            const event = JSON.parse(raw) as StreamRunEvent
            onEvent(event)
          } catch {
            // skip malformed
          }
        }
      }
    }
    if (buffer.trim()) {
      const line = buffer.trim()
      if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim()
        if (raw && raw !== '[DONE]') {
          try {
            const event = JSON.parse(raw) as StreamRunEvent
            onEvent(event)
          } catch {
            // skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
