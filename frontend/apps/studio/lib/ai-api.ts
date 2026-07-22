/**
 * AI API client for communicating with the project service via the platform proxy.
 *
 * Platform (IS_PLATFORM=true): requests go through the control plane at
 * {API_URL}/platform/project-api/{ref}/{endpoint} — the browser sends its
 * GoTrue user token; the control plane authenticates + routes to the project.
 *
 * Self-host (IS_PLATFORM=false): there is no control plane. Requests go
 * same-origin to /api/platform/project-api/{ref}/{endpoint} — a Studio
 * server-side proxy (pages/api/platform/project-api/[ref]/[...path].ts) that
 * injects the local service_role credential and forwards to the local
 * project-service via Kong. Mirrors the verified self-host pattern used by
 * pg-meta (lib/api/self-hosted/query.ts): same-origin Studio-server route ->
 * privileged credential -> local backend, secret never leaves the server.
 */

import { IS_PLATFORM } from '@/lib/constants'

// ── Configuration ──────────────────────────────────────────────────────

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

/** Get the base URL for a project's API, routed through the platform proxy. */
export function getProjectApiBaseUrl(ref: string): string {
  if (!IS_PLATFORM) return `/api/platform/project-api/${ref}`
  return `${API_URL}/platform/project-api/${ref}`
}

/**
 * Whether an AI data hook has enough auth to fire its request.
 *
 * Platform: requires a real GoTrue user token (unchanged prod semantics —
 * the control-plane proxy authenticates the caller via this Bearer token).
 *
 * Self-host: there is no per-user browser token — Studio is gated by Kong
 * basic-auth, not a GoTrue session, so `token` never resolves to a truthy
 * value (see hooks/ai/useProjectSupabaseClient.ts). The same-origin project-
 * api proxy injects the real service_role credential server-side regardless
 * of what the browser sends, so hooks should fire once the page itself is
 * ready — token positivity is irrelevant here.
 */
export function hasAiAuth(token: string | null | undefined): boolean {
  return IS_PLATFORM ? !!token : true
}

/**
 * Authorization header for AI API calls — OMITTED when there is no real token.
 *
 * Self-host has no GoTrue session (see hasAiAuth), so `token` is '' and a
 * template literal would send `Authorization: Bearer `. Studio is reached
 * through Kong's `dashboard` catch-all route, which carries the `basic-auth`
 * plugin: the browser attaches `Authorization: Basic <creds>` automatically,
 * but an EXPLICIT Authorization header on a fetch REPLACES it, so Kong 401s
 * the request (verified: any Bearer value 401s here — even a valid
 * service_role — because the route requires Basic). The client then maps that
 * 401 to SessionExpiredError, surfacing a bogus "Session expired" toast.
 *
 * Mirrors upstream's data/fetchers.ts:constructHeaders, which guards the same
 * way (`if (!headers.has('Authorization'))` + `if (accessToken)`) and is why
 * every inherited Supabase feature already works self-hosted.
 */
export function aiAuthHeader(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Build a full project-api URL (useful for raw fetch calls like blob downloads). */
export function projectApiUrl(ref: string, endpoint: string): string {
  return `${getProjectApiBaseUrl(ref)}${endpoint}`
}

// ── Error Handling ─────────────────────────────────────────────────────

let _sessionToastShown = false

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please refresh the page to sign in again.')
    this.name = 'SessionExpiredError'
    SessionExpiredError.showToast()
  }

  static showToast() {
    if (_sessionToastShown) return
    _sessionToastShown = true
    import('sonner')
      .then(({ toast }) => {
        toast.error('Session expired', {
          description: 'Please refresh the page to sign in again.',
          duration: Infinity,
          action: {
            label: 'Refresh',
            onClick: () => window.location.reload(),
          },
        })
      })
      .catch(() => {
        _sessionToastShown = false
      })
  }
}

/** Existing source returned under `duplicate` in the 409 dedup response. */
export interface DuplicateSource {
  id: string
  name: string | null
  file_type: string
  extraction_status: string | null
  created_at: string | null
}

export class DuplicateSourceError extends Error {
  duplicate: DuplicateSource
  constructor(duplicate: DuplicateSource) {
    super('A source with identical content already exists in this project.')
    this.name = 'DuplicateSourceError'
    this.duplicate = duplicate
  }
}

function tryParseDuplicateError(
  status: number,
  data: Record<string, unknown>,
): DuplicateSourceError | null {
  if (status !== 409 || data.error !== 'duplicate_source') return null
  const dup = data.duplicate
  if (
    typeof dup !== 'object' ||
    dup === null ||
    typeof (dup as { id?: unknown }).id !== 'string'
  ) {
    return null
  }
  return new DuplicateSourceError(dup as DuplicateSource)
}

// ── Core Fetch Helpers ─────────────────────────────────────────────────

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string
  signal?: AbortSignal
}

export async function api<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })

  if (response.status === 204) {
    return undefined as T
  }

  if (response.status === 401) {
    throw new SessionExpiredError()
  }

  const text = await response.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText || 'request failed'} (non-JSON response)`
    )
  }

  if (!response.ok) {
    const dupErr = tryParseDuplicateError(response.status, data)
    if (dupErr) throw dupErr
    // `error` is a machine code; prefer `message` for the human banner.
    throw new Error(
      (data.message as string) || (data.error as string) || 'API request failed'
    )
  }

  return data as T
}

/**
 * Make a request to a project's API service via the platform proxy.
 */
export async function projectApi<T>(
  token: string,
  ref: string,
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    signal?: AbortSignal
  } = {}
): Promise<T> {
  return api<T>(projectApiUrl(ref, endpoint), {
    ...options,
    token,
  })
}

// ── List pagination helpers ────────────────────────────────────────────

export interface ListParams {
  limit?: number
  offset?: number
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
}

export function buildListQuery(params: ListParams): string {
  const qs = new URLSearchParams()
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  if (params.q) qs.set('q', params.q)
  if (params.sort) qs.set('sort', params.sort)
  if (params.order) qs.set('order', params.order)
  const s = qs.toString()
  return s ? `?${s}` : ''
}

/** Upload a file to project's API via the platform proxy. */
export async function projectApiUpload<T>(
  token: string,
  ref: string,
  endpoint: string,
  formData: FormData
): Promise<T> {
  const headers: Record<string, string> = {
    ...aiAuthHeader(token),
  }
  const response = await fetch(projectApiUrl(ref, endpoint), {
    method: 'POST',
    headers,
    body: formData,
  })
  if (response.status === 401) {
    throw new SessionExpiredError()
  }
  const text = await response.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText || 'upload failed'} (non-JSON response)`
    )
  }
  if (!response.ok) {
    const dupErr = tryParseDuplicateError(response.status, data)
    if (dupErr) throw dupErr
    throw new Error(
      (data.message as string) || (data.error as string) || 'Project upload failed'
    )
  }
  return data as T
}

// ── Types ──────────────────────────────────────────────────────────────

export interface IndexedSourceInKb {
  id: string
  source_id: string
  index_status: string
  indexed_at: string | null
  stats: Record<string, unknown>
  error_message: string | null
  source_name: string
  file_type: string
  indexing_config_snapshot?: Record<string, unknown>
}

export interface SessionWithRuns {
  id: string
  session_id: string
  agent_id: string
  user_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  runs?: Array<{
    id: string
    run_id: string
    status: string
    input_messages: Array<{ role: string; content: string }>
    output_messages: Array<{ role: string; content: string }>
    content: string | null
    usage: Record<string, unknown> | null
    error: string | null
    started_at: string | null
    completed_at: string | null
    created_at: string | null
  }>
}

export interface Citation {
  source_id?: string
  source_name?: string
  chunk_id?: string
  text?: string
  score?: number
  page?: number
  key?: string
}

export type StreamRunEvent =
  | {
      event: 'start'
      run_id: string
      session_id: string
      context_handler_id?: string | null
      citation_candidates?: Citation[]
      reasoning_requested?: boolean
    }
  | { event: 'chunk'; content: string }
  | { event: 'content_delta'; delta: string }
  | { event: 'reasoning_delta'; step: number; source: string; delta: string }
  | { event: 'step_reset'; step: number; reason: string }
  | {
      event: 'reasoning_dropped_at_provider_switch'
      from_provider: string
      to_provider: string
    }
  | { event: 'step_started'; step: number }
  | { event: 'tool_call'; tool_name: string; arguments: Record<string, unknown> }
  | { event: 'tool_result'; tool_name: string; result_preview: string; duration_ms: number }
  | { event: 'step_completed'; step: number }
  | { event: 'delegation_started'; agent: string; child_run_id: string }
  | { event: 'delegation_completed'; agent: string; usage: Record<string, unknown> }
  | { event: 'reasoning'; step: number; source?: string; content: string }
  | {
      event: 'approval_requested'
      run_id: string
      tool_name: string
      tool_input: Record<string, unknown>
      message: string
    }
  | {
      event: 'complete'
      run_id: string
      session_id: string
      content: string
      retrieved_items?: number
      is_new_session?: boolean
      context_handler_id?: string | null
      status?: string
      citations?: Citation[]
      tool_calls?: Array<{
        step: number
        tool_name: string
        arguments: Record<string, unknown>
        result: string | unknown[]
        duration_ms: number
      }>
    }
  | { event: 'error'; error: string; run_id: string; context_handler_id?: string | null }

/**
 * Stream agent run via POST (SSE) - proxied through platform.
 */
export async function streamAgentRun(
  token: string,
  ref: string,
  agentId: string,
  body: {
    message: string
    session_id?: string
    knowledge_bases?: Array<{ id: string; top_k?: number; source_ids?: string[] }>
    context_items?: Array<{
      item_id?: string
      text?: string
      meta?: Record<string, unknown>
    }>
    citations_enabled?: boolean
  },
  onEvent: (event: StreamRunEvent) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...aiAuthHeader(token),
  }
  const response = await fetch(
    projectApiUrl(ref, `/agents/${agentId}/run/stream`),
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

// ── Sources API ────────────────────────────────────────────────────────

export interface DownloadSourceResponse {
  url: string
  name: string
  file_type: string
  expires_in: number
}

export interface SourceDetail {
  id: string
  name: string
  file_type: string
  storage_path: string | null
  extraction_status: string
  derivatives: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  auto_metadata: Record<string, unknown> | null
  error_message: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SourceListResponse {
  items: SourceDetail[]
  total: number
  limit: number
  offset: number
}

export const sourcesApi = {
  list: async (
    token: string,
    ref: string,
    params: ListParams & { status?: string } = {},
    signal?: AbortSignal,
  ): Promise<SourceListResponse> => {
    const qs = buildListQuery(params)
    const sep = qs ? '&' : '?'
    const path = `/sources${qs}${params.status ? `${sep}status=${encodeURIComponent(params.status)}` : ''}`
    const data = await projectApi<{
      sources: SourceDetail[]
      total: number
      limit: number
      offset: number
    }>(token, ref, path, { signal })
    return { items: data.sources, total: data.total, limit: data.limit, offset: data.offset }
  },

  get: (token: string, ref: string, sourceId: string) =>
    projectApi<SourceDetail>(token, ref, `/sources/${sourceId}`),

  delete: (token: string, ref: string, sourceId: string) =>
    projectApi<{ message: string; warning?: string }>(token, ref, `/sources/${sourceId}`, {
      method: 'DELETE',
    }),

  upload: (token: string, ref: string, file: File, name?: string, metadata?: Record<string, unknown>, extractionModel?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (name) formData.append('name', name)
    if (metadata) formData.append('metadata', JSON.stringify(metadata))
    if (extractionModel) formData.append('extraction_model', extractionModel)
    return projectApiUpload<{ id: string; name: string; extraction_status: string }>(
      token, ref, '/sources/upload', formData
    )
  },

  /** Import sources from URLs (list, crawl, or sitemap) */
  importUrl: (
    token: string,
    ref: string,
    data: {
      mode: "urls" | "crawl" | "sitemap";
      urls?: string[];
      url?: string;
      max_depth?: number;
      max_pages?: number;
    }
  ) =>
    projectApi<{ sources: { id: string; name: string; url: string }[]; count: number }>(
      token, ref,
      '/sources/import-url',
      { method: 'POST', body: data }
    ),

  importFromStorage: (
    token: string, ref: string,
    data: { bucket: string; path: string; name?: string; extraction_model?: string }
  ) =>
    projectApi<{ id: string; name: string; file_type: string; storage_path: string; extraction_status: string }>(
      token, ref, '/sources/import-from-storage', { method: 'POST', body: data }
    ),

  download: (token: string, ref: string, sourceId: string) =>
    projectApi<DownloadSourceResponse>(token, ref, `/sources/${sourceId}/download`),

  getPageTexts: (token: string, ref: string, sourceId: string) =>
    projectApi<{ page_texts: string[]; count: number }>(token, ref, `/sources/${sourceId}/page-texts`),

  getPageText: (token: string, ref: string, sourceId: string, page: number) =>
    projectApi<{ text: string; page: number; count: number }>(
      token, ref, `/sources/${sourceId}/page-texts?page=${page}`
    ),

  cancelExtraction: (token: string, ref: string, sourceId: string) =>
    projectApi<{ message: string }>(token, ref, `/sources/${sourceId}/cancel`, { method: 'POST' }),

  /** Re-run extraction for a source (optionally with a different extraction model). */
  reextract: (token: string, ref: string, sourceId: string, extractionModel?: string) =>
    projectApi<{ message: string; task_id: string }>(
      token, ref, `/sources/${sourceId}/reextract`,
      { method: 'POST', body: extractionModel ? { extraction_model: extractionModel } : {} }
    ),

  /** Update user-editable source fields (name, metadata). */
  update: (
    token: string,
    ref: string,
    sourceId: string,
    data: { name?: string; metadata?: Record<string, unknown> }
  ) =>
    projectApi<{ id: string; name: string; metadata: Record<string, unknown> | null }>(
      token, ref, `/sources/${sourceId}`, { method: 'PATCH', body: data }
    ),

  getSourcePageImage: async (token: string, ref: string, sourceId: string, pageIndex: number): Promise<string | null> => {
    const url = projectApiUrl(ref, `/sources/${sourceId}/derivatives/image/download?index=${pageIndex}`)
    const response = await fetch(url, {
      headers: aiAuthHeader(token),
    })
    if (response.status === 401) throw new SessionExpiredError()
    if (!response.ok) return null
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  },

  getSourceTextContent: async (token: string, ref: string, sourceId: string): Promise<string | null> => {
    for (const derivType of ['markdown', 'text']) {
      const url = projectApiUrl(ref, `/sources/${sourceId}/derivatives/${derivType}/download?index=0`)
      const response = await fetch(url, {
        headers: aiAuthHeader(token),
      })
      if (response.status === 401) throw new SessionExpiredError()
      if (response.ok) {
        return await response.text()
      }
    }
    return null
  },
}

// ── Knowledge Bases API ────────────────────────────────────────────────

export interface SearchResultItem {
  chunk_id: string
  text: string
  score: number
  source_id: string
  knowledge_base_id?: string
  meta?: Record<string, unknown>
}

export interface KBDefaults {
  strategies: Record<string, {
    label: string
    compatible_retrievers: string[]
    retriever_labels: Record<string, string>
    default_retrieval_method: string
    supports_reranker: boolean
    default_indexing_config: Record<string, unknown>
    default_retrieval_config: Record<string, unknown>
  }>
  reranker: {
    default_model: string
    candidate_count: number
    options: { value: string; label: string; provider: string }[]
  }
  query_enrichment: { model: string }
  enrichment: { model: string; max_tokens: number }
  hybrid_vector_weight: number
  extraction?: {
    default_method: string
    fallback_chain: string[]
    options: { value: string; label: string; description: string }[]
  }
}

export const kbDefaultsApi = {
  get: (token: string, ref: string) =>
    projectApi<KBDefaults>(token, ref, '/config/kb-defaults'),
}

export interface KnowledgeBaseListItem {
  id: string
  name: string
  description: string | null
  indexing_config: Record<string, unknown>
  retrieval_config: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
  source_counts: {
    pending: number
    indexing: number
    indexed: number
    failed: number
    cancelled: number
    total: number
  }
  chunk_count: number
  enrichment_status: 'none' | 'enriching' | 'enriched' | 'failed'
  enrichment_progress: { enriched_count: number; total_count: number } | null
}

export interface KnowledgeBaseListResponse {
  items: KnowledgeBaseListItem[]
  total: number
  limit: number
  offset: number
}

export const knowledgeBasesApi = {
  list: async (
    token: string,
    ref: string,
    params: ListParams = {},
    signal?: AbortSignal,
  ): Promise<KnowledgeBaseListResponse> => {
    const path = `/knowledge-bases${buildListQuery(params)}`
    const data = await projectApi<{
      knowledge_bases: KnowledgeBaseListItem[]
      total: number
      limit: number
      offset: number
    }>(token, ref, path, { signal })
    return {
      items: data.knowledge_bases,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
    }
  },

  get: (token: string, ref: string, kbId: string) =>
    projectApi<{
      id: string
      name: string
      description: string | null
      indexing_config: Record<string, unknown>
      retrieval_config: Record<string, unknown>
      created_at: string | null
      updated_at: string | null
      // Optional because pre-`08286779` project-service builds omit this
      // field; the kb-detail page applies a safe-zero fallback. Do not
      // drop this `?` without removing that guard too.
      source_counts?: {
        indexed: number
        failed: number
        pending: number
        indexing: number
        cancelled: number
        total: number
      }
      drift: 'none' | 'enrichment_only' | 'full'
      // Present only when (a) the KB's retrieval method uses BM25
      // (hybrid / full_text) AND (b) the project's BM25_AUTO_INDEXING
      // setting is off (manual rebuild mode). Omitted otherwise.
      bm25_status?: 'absent' | 'stale' | 'ready'
    }>(token, ref, `/knowledge-bases/${kbId}`),

  listIndexedSources: (
    token: string,
    ref: string,
    kbId: string,
    params: {
      q?: string
      status?: 'indexed' | 'failed' | 'pending' | 'indexing' | 'cancelled'
      sort?: 'name' | 'created_at'
      order?: 'asc' | 'desc'
      limit?: number
      offset?: number
    } = {}
  ) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.status) qs.set('status', params.status)
    if (params.sort) qs.set('sort', params.sort)
    if (params.order) qs.set('order', params.order)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    const path = `/knowledge-bases/${kbId}/sources${qs.toString() ? `?${qs}` : ''}`
    return projectApi<{
      items: Array<{
        id: string
        source_id: string
        index_status: string
        indexed_at: string | null
        stats: Record<string, unknown>
        error_message: string | null
        source_name: string
        file_type: string
        source_created_at: string | null
      }>
      total: number
      limit: number
      offset: number
    }>(token, ref, path)
  },

  create: (
    token: string, ref: string,
    data: { name: string; description?: string | null; indexing_config?: Record<string, unknown>; retrieval_config?: Record<string, unknown> }
  ) =>
    projectApi<{
      id: string
      name: string
      description: string | null
      indexing_config: Record<string, unknown>
      retrieval_config: Record<string, unknown>
    }>(token, ref, `/knowledge-bases`, { method: 'POST', body: data }),

  update: (
    token: string, ref: string, kbId: string,
    data: { name?: string; description?: string; indexing_config?: Record<string, unknown>; retrieval_config?: Record<string, unknown> }
  ) =>
    projectApi<unknown>(token, ref, `/knowledge-bases/${kbId}`, { method: 'PATCH', body: data }),

  addSource: (token: string, ref: string, kbId: string, sourceId: string) =>
    projectApi<{
      id: string; knowledge_base_id: string; source_id: string
      source_name: string; index_status: string; task_id: string
    }>(token, ref, `/knowledge-bases/${kbId}/sources`, { method: 'POST', body: { source_id: sourceId } }),

  cancelIndexing: (token: string, ref: string, kbId: string, indexedSourceId: string) =>
    projectApi<{ message: string }>(token, ref, `/knowledge-bases/${kbId}/sources/${indexedSourceId}/cancel`, { method: 'POST' }),

  removeSource: (token: string, ref: string, kbId: string, indexedSourceId: string) =>
    projectApi<{ message: string; deleted_indexed_source_id: string; kb_id: string }>(
      token,
      ref,
      `/knowledge-bases/${kbId}/sources/${indexedSourceId}`,
      { method: 'DELETE' }
    ),

  search: (
    token: string, ref: string, kbId: string,
    data: { query: string; top_k?: number; retrieval_method?: string }
  ) =>
    projectApi<{ results: SearchResultItem[]; query: string; retrieval_method: string; total_results: number }>(
      token, ref, `/knowledge-bases/${kbId}/search`, { method: 'POST', body: data }
    ),

  getGraphEnrichmentErrors: (token: string, ref: string, kbId: string) =>
    projectApi<Record<string, { total: number; failed: number }>>(
      token, ref, `/knowledge-bases/${kbId}/graph-enrichment/errors`
    ),

  getEnrichmentResults: (token: string, ref: string, kbId: string, itemIds?: string[]) => {
    const params = itemIds ? `?item_ids=${itemIds.join(',')}` : ''
    return projectApi<{ results: Record<string, Record<string, unknown>>; fields?: EnrichmentField[]; item_errors?: Record<string, string> }>(
      token, ref, `/knowledge-bases/${kbId}/enrichment/results${params}`
    )
  },

  getEnrichmentConfig: (token: string, ref: string, kbId: string) =>
    projectApi<{ config: EnrichmentConfig }>(
      token, ref, `/knowledge-bases/${kbId}/enrichment`
    ),

  saveEnrichmentConfig: (token: string, ref: string, kbId: string, data: Record<string, unknown>) =>
    projectApi<{ config: EnrichmentConfig; re_enrichment_triggered?: boolean }>(
      token, ref, `/knowledge-bases/${kbId}/enrichment`, { method: 'PUT', body: data }
    ),

  runEnrichment: (token: string, ref: string, kbId: string, force?: boolean, retryFailed?: boolean) =>
    projectApi<{ message: string }>(
      token, ref, `/knowledge-bases/${kbId}/enrichment/run`, {
        method: 'POST',
        body: { force: force ?? false, retry_failed: retryFailed ?? false },
      }
    ),

  deleteEnrichmentConfig: (token: string, ref: string, kbId: string) =>
    projectApi<{ message: string }>(
      token, ref, `/knowledge-bases/${kbId}/enrichment`, { method: 'DELETE' }
    ),

  reindex: (
    token: string,
    ref: string,
    kbId: string,
    options?: {
      /** Only reindex specific indexed_sources rows. Wins over failedOnly. */
      indexedSourceIds?: string[]
      /** Reindex every row currently in `failed` status. */
      failedOnly?: boolean
    },
  ) => {
    const body: Record<string, unknown> = {}
    if (options?.indexedSourceIds && options.indexedSourceIds.length > 0) {
      body.indexed_source_ids = options.indexedSourceIds
    } else if (options?.failedOnly) {
      body.failed_only = true
    }
    return projectApi<{
      status: string
      knowledge_base_id: string
      count?: number
      scope?: 'all' | 'selected' | 'failed_only'
      task_id?: string
      task_ids?: string[]
      message?: string
    }>(token, ref, `/knowledge-bases/${kbId}/reindex`, { method: 'POST', body })
  },

  buildBm25: (token: string, ref: string, kbId: string) =>
    projectApi<{
      task_id: string
      knowledge_base_id: string
    }>(token, ref, `/knowledge-bases/${kbId}/build-bm25`, { method: 'POST' }),

  reenrichGraphReferences: (
    token: string, ref: string, kbId: string,
    retryFailed?: boolean, indexedSourceId?: string
  ) => {
    const body: Record<string, unknown> = { retry_failed: retryFailed ?? false }
    if (indexedSourceId) body.indexed_source_id = indexedSourceId
    return projectApi<{ message: string }>(
      token, ref, `/knowledge-bases/${kbId}/graph-enrichment/run`, { method: 'POST', body }
    )
  },
}

// ── Chunks, PageIndex, Doc2JSON types ─────────────────────────────────

export interface ChunksListResponse {
  chunks: Array<{
    id: string
    indexed_source_id: string
    text: string
    chunk_index: number | null
    start_char: number | null
    end_char: number | null
    // Not selected by the chunks route (routes/knowledge_bases.py
    // list_chunks_for_indexed_source) — only `meta` is. Kept optional
    // rather than removed; see PageIndexNodeItem comment below.
    metadata?: Record<string, unknown>
    tokens?: number
    meta?: Record<string, unknown>
  }>
  total: number
  limit: number
  offset: number
  page?: number
}

// `summary`/`content`/`level`/`parent_id`/`page_start`/`page_end` were never
// actually selected by either the pre-migration `.select('*')` PostgREST call
// or the project-service route that replaced it (routes/knowledge_bases.py
// _fetch_index_nodes) — the KB detail page only ever reads node_id/title/
// depth/text/meta/id. Marked optional (not removed) to keep the interface an
// honest superset without deleting a pre-existing declaration outright.
export interface PageIndexNodeItem {
  node_id: string
  title: string
  summary?: string | null
  content?: string | null
  level?: number
  parent_id?: string | null
  source_id: string
  page_start?: number | null
  page_end?: number | null
  id?: string
  depth?: number
  text?: string
  meta?: Record<string, unknown>
}

// Same stale-field note as PageIndexNodeItem — the TOC route only ever
// selected/returned structure/doc_name/doc_description.
export interface PageIndexTocItem {
  node_id?: string
  title?: string
  level?: number
  parent_id?: string | null
  structure?: TocStructureNode[]
  doc_name?: string
  doc_description?: string
}

export interface TocStructureNode {
  node_id: string
  title: string
  level: number
  children: TocStructureNode[]
  nodes?: TocStructureNode[]
}

// `embedding_text`/`metadata` were never selected by the original
// `.select('id, source_id, summary, summary_model, summary_tokens,
// full_text_tokens, meta')` call — same stale-field note as PageIndexNodeItem.
export interface FullDocumentItem {
  id: string
  source_id: string
  summary: string | null
  embedding_text?: string | null
  metadata?: Record<string, unknown>
  summary_model?: string
  summary_tokens?: number
  full_text_tokens?: number
  meta?: Record<string, unknown>
}

// `extracted_data`/`metadata` were never selected by the original
// `.select('*')` call either — the doc2json viewer only ever reads
// extracted_json. Same stale-field note as PageIndexNodeItem.
export interface Doc2JSONDocument {
  id: string
  source_id: string
  extracted_data?: Record<string, unknown>
  metadata?: Record<string, unknown>
  summary?: string
  extracted_json?: Record<string, unknown>
  extraction_model?: string
  window_count?: number
  input_tokens?: number
  summary_tokens?: number
}

export interface AvailableSourceItem {
  id: string
  name: string
  file_type: string
  storage_path: string | null
  extraction_status: string
  derivatives: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

export interface AvailableSourcesResponse {
  sources: AvailableSourceItem[]
  total: number
  limit: number
  offset: number
}

// ── KB Inspector API (chunks / page-index / graph-index / full-document /
// doc2json — the "inspect indexed source" modal on the KB detail page) ──

export const kbInspectorApi = {
  /** Extracted sources not yet indexed into this KB — the "Add source" modal.
   *  Replaces the client-side `ai.list_sources_excluding_kb` RPC call. */
  listAvailableSources: (
    token: string,
    ref: string,
    kbId: string,
    params: { q?: string; limit?: number; offset?: number } = {},
  ) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString() ? `?${qs}` : ''
    return projectApi<AvailableSourcesResponse>(
      token, ref, `/knowledge-bases/${kbId}/available-sources${query}`,
    )
  },

  listChunks: (
    token: string,
    ref: string,
    kbId: string,
    indexedSourceId: string,
    params: { limit?: number; offset?: number } = {},
  ) => {
    const qs = new URLSearchParams()
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString() ? `?${qs}` : ''
    return projectApi<Omit<ChunksListResponse, 'page'>>(
      token, ref,
      `/knowledge-bases/${kbId}/indexed-sources/${indexedSourceId}/chunks${query}`,
    )
  },

  listPageIndexNodes: (token: string, ref: string, kbId: string, indexedSourceId: string) =>
    projectApi<{ nodes: PageIndexNodeItem[] }>(
      token, ref,
      `/knowledge-bases/${kbId}/indexed-sources/${indexedSourceId}/page-index-nodes`,
    ),

  getPageIndexToc: (token: string, ref: string, kbId: string, indexedSourceId: string) =>
    projectApi<{ toc: PageIndexTocItem | null }>(
      token, ref,
      `/knowledge-bases/${kbId}/indexed-sources/${indexedSourceId}/page-index-toc`,
    ),

  listGraphIndexNodes: (token: string, ref: string, kbId: string, indexedSourceId: string) =>
    projectApi<{ nodes: PageIndexNodeItem[] }>(
      token, ref,
      `/knowledge-bases/${kbId}/indexed-sources/${indexedSourceId}/graph-index-nodes`,
    ),

  getGraphIndexToc: (token: string, ref: string, kbId: string, indexedSourceId: string) =>
    projectApi<{ toc: PageIndexTocItem | null }>(
      token, ref,
      `/knowledge-bases/${kbId}/indexed-sources/${indexedSourceId}/graph-index-toc`,
    ),

  getFullDocument: (token: string, ref: string, kbId: string, indexedSourceId: string) =>
    projectApi<{ document: FullDocumentItem | null }>(
      token, ref,
      `/knowledge-bases/${kbId}/indexed-sources/${indexedSourceId}/full-document`,
    ),

  getDoc2jsonDocument: (token: string, ref: string, kbId: string, indexedSourceId: string) =>
    projectApi<{ document: Doc2JSONDocument | null; source_derivatives: Record<string, unknown> | null }>(
      token, ref,
      `/knowledge-bases/${kbId}/indexed-sources/${indexedSourceId}/doc2json-document`,
    ),
}

export interface EnrichmentField {
  name: string
  type: string
  description: string
  prompt_template?: string
  enum_values?: string[]
}

export interface EnrichmentConfig {
  model: string
  max_tokens: number
  fields: EnrichmentField[]
  status: string
  llm_model: string
  use_multimodal: boolean
  total_count: number
  enriched_count: number
  error_message: string | null
}

// ── Database types ────────────────────────────────────────────────────

/**
 * The /api/database/tables endpoint returns a flat array of table-name strings
 * (see routes/database.py:list_tables — `jsonify({"tables": tables})` where
 * `tables = [row[0] for row in ...]`). Prior typed-as-object was a pre-port
 * mismatch that caused api-docs to render `/rest/v1/undefined` for every table.
 * Callers that need richer metadata must use pg-meta via databaseMetaApi.
 */
export type TableInfo = string

export interface OpenApiSpec {
  swagger?: string
  openapi?: string
  info: {
    title: string
    description?: string
    version: string
  }
  paths: Record<string, Record<string, unknown>>
  definitions?: Record<string, unknown>
  components?: {
    schemas?: Record<string, unknown>
  }
}

export const databaseApi = {
  listTables: (token: string, ref: string, schema?: string) => {
    const params = new URLSearchParams()
    if (schema) params.set('schema', schema)
    const query = params.toString() ? `?${params.toString()}` : ''
    return projectApi<{ tables: string[] }>(
      token, ref, `/database/tables${query}`
    )
  },

  getOpenApiSpec: (token: string, ref: string) =>
    projectApi<OpenApiSpec>(token, ref, '/database/openapi'),
}

// ── Agents API ────────────────────────────────────────────────────────

export interface AgentStats {
  agent_id: string
  session_count: number
  total_runs: number
  runs_by_status: Record<string, number>
}

export interface AgentListItem {
  id: string
  name: string
  model: string
  system_prompt: string | null
  settings: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
  session_count: number
  total_runs: number
  last_run_at: string | null
}

export interface AgentListResponse {
  items: AgentListItem[]
  total: number
  limit: number
  offset: number
}

export interface AgentDetail {
  id: string
  name: string
  model: string
  system_prompt: string | null
  settings: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

export const agentsApi = {
  list: async (
    token: string,
    ref: string,
    params: ListParams = {},
    signal?: AbortSignal,
  ): Promise<AgentListResponse> => {
    const path = `/agents${buildListQuery(params)}`
    const data = await projectApi<{
      agents: AgentListItem[]
      total: number
      limit: number
      offset: number
    }>(token, ref, path, { signal })
    return {
      items: data.agents,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
    }
  },

  getStats: async (token: string, ref: string, agentId: string): Promise<AgentStats | null> => {
    try {
      return await projectApi<AgentStats>(token, ref, `/agents/${agentId}/stats`)
    } catch {
      return null
    }
  },

  create: (
    token: string,
    ref: string,
    data: {
      name: string
      model?: string
      system_prompt?: string | null
      settings?: Record<string, unknown>
    },
  ) => projectApi<AgentDetail>(token, ref, '/agents', { method: 'POST', body: data }),

  get: (token: string, ref: string, agentId: string) =>
    projectApi<AgentDetail>(token, ref, `/agents/${agentId}`),

  update: (
    token: string,
    ref: string,
    agentId: string,
    data: Partial<{
      name: string
      model: string
      system_prompt: string | null
      settings: Record<string, unknown>
    }>,
  ) => projectApi<AgentDetail>(token, ref, `/agents/${agentId}`, { method: 'PATCH', body: data }),

  delete: (token: string, ref: string, agentId: string) =>
    projectApi<{ message: string }>(token, ref, `/agents/${agentId}`, { method: 'DELETE' }),
}

// ── Sessions API ──────────────────────────────────────────────────────

export interface SessionListItem {
  session_id: string
  run_count: number
  last_activity_at: string | null
  created_at: string | null
  first_message: string | null
}

export interface SessionListResponse {
  sessions: SessionListItem[]
  total: number
  limit: number
  offset: number
}

export interface ActivityItem {
  id: string;
  kind: "tool" | "delegation" | "reasoning";
  status: "running" | "done" | "error";
  toolName?: string;
  arguments?: Record<string, unknown>;
  resultPreview?: string;
  durationMs?: number;
  agentName?: string;
  parentDelegationId?: string;
  content?: string;
  startedAt: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  run_id?: string
  timestamp?: string | null
  citations?: Citation[]
  citation_candidates?: Citation[]
  activityItems?: ActivityItem[]
  reasoning_requested?: boolean
  reasoning?: {
    thinking_blocks?: Array<{ type?: string; thinking?: string; signature?: string }>
    summary_text?: string | null
  } | null
  reasoning_duration_ms?: number | null
  events?: Array<{ type?: string; event?: string; [key: string]: unknown }>
}

export const sessionsApi = {
  listForAgent: (
    token: string,
    ref: string,
    agentId: string,
    options?: {
      limit?: number
      offset?: number
      search?: string
      created_after?: string
      created_before?: string
      min_runs?: number
      max_runs?: number
    }
  ) => {
    const params = new URLSearchParams()
    if (options?.limit != null) params.set('limit', String(options.limit))
    if (options?.offset != null) params.set('offset', String(options.offset))
    if (options?.search) params.set('search', options.search)
    if (options?.created_after) params.set('created_after', options.created_after)
    if (options?.created_before) params.set('created_before', options.created_before)
    if (options?.min_runs != null) params.set('min_runs', String(options.min_runs))
    if (options?.max_runs != null) params.set('max_runs', String(options.max_runs))
    const query = params.toString() ? `?${params.toString()}` : ''
    return projectApi<SessionListResponse>(token, ref, `/agents/${agentId}/sessions${query}`)
  },

  getMessages: (
    token: string,
    ref: string,
    sessionId: string,
    options?: { limit?: number }
  ) => {
    const params = new URLSearchParams()
    if (options?.limit != null) params.set('limit', String(options.limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    return projectApi<{ session_id: string; messages: ChatMessage[] }>(
      token, ref, `/sessions/${sessionId}/messages${query}`
    )
  },

  delete: (token: string, ref: string, sessionId: string) =>
    projectApi<{ success: boolean }>(token, ref, `/sessions/${sessionId}`, { method: 'DELETE' }),

  getRuns: (
    token: string,
    ref: string,
    sessionId: string,
    options?: { limit?: number; offset?: number }
  ) => {
    const params = new URLSearchParams()
    if (options?.limit != null) params.set('limit', String(options.limit))
    if (options?.offset != null) params.set('offset', String(options.offset))
    const query = params.toString() ? `?${params.toString()}` : ''
    return projectApi<{
      session_id: string
      runs: Array<{
        id: string; run_id: string; status: string
        input_messages: Array<{ role: string; content: string }>
        output_messages: Array<{ role: string; content: string }>
        content: string | null
        usage: Record<string, number> | null
        model?: string | null
        error: string | null
        started_at: string | null
        completed_at: string | null
        created_at: string | null
        steps: number | null
        events: Array<{ type: string; [key: string]: unknown }>
        tool_calls?: Array<{ step: number; tool_name: string; arguments: Record<string, unknown>; result: string | unknown[]; duration_ms: number }>
      }>
    }>(token, ref, `/sessions/${sessionId}/runs${query}`)
  },

  getRunRetrievedContext: (token: string, ref: string, sessionId: string, runId: string) =>
    projectApi<{ session_id: string; run_id: string; retrieved_context: unknown[] | null }>(
      token, ref, `/sessions/${sessionId}/runs/${runId}/retrieved-context`
    ),
}

// ── Copilot API ───────────────────────────────────────────────────────

export interface CopilotSession {
  id: string
  workflow_id: string
  created_at: string
  updated_at: string
}

export interface CopilotMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  workflow_diff: WorkflowDiff | null
  pre_snapshot: { nodes: unknown[]; edges: unknown[] } | null
  created_at: string
}

export interface WorkflowDiff {
  add_blocks?: Array<{
    id: string
    type: string
    name?: string
    position: { x: number; y: number }
    config?: Record<string, unknown>
  }>
  remove_blocks?: string[]
  update_blocks?: Array<{ id: string; config: Record<string, unknown> }>
  add_edges?: Array<{ source: string; target: string; sourceHandle?: string }>
  remove_edges?: Array<{ source: string; target: string; sourceHandle?: string }>
}

export type CopilotStreamEvent =
  | { event: 'chunk'; content: string }
  | { event: 'tool_call'; tool_call: { name: string; arguments: Record<string, unknown> } }
  | { event: 'status'; message: string }
  | { event: 'reasoning_delta'; step: number | null; delta: string }
  | { event: 'complete'; message_id: string; content: string; workflow_diff: WorkflowDiff | null }
  | { event: 'error'; error: string }

export const copilotApi = {
  getSession: (token: string, ref: string, workflowId: string) =>
    projectApi<{ session: CopilotSession | null }>(
      token, ref, `/copilot/sessions?workflow_id=${workflowId}`
    ),

  createSession: (token: string, ref: string, workflowId: string) =>
    projectApi<{ id: string; workflow_id: string }>(
      token, ref, '/copilot/sessions',
      { method: 'POST', body: { workflow_id: workflowId } }
    ),

  deleteSession: (token: string, ref: string, sessionId: string) =>
    projectApi<void>(
      token, ref, `/copilot/sessions/${sessionId}`,
      { method: 'DELETE' }
    ),

  getMessages: (token: string, ref: string, sessionId: string) =>
    projectApi<{ messages: CopilotMessage[] }>(
      token, ref, `/copilot/sessions/${sessionId}/messages`
    ),

  saveSnapshot: (
    token: string, ref: string,
    sessionId: string, messageId: string,
    preSnapshot: { nodes: unknown[]; edges: unknown[] }
  ) =>
    projectApi<{ ok: boolean }>(
      token, ref,
      `/copilot/sessions/${sessionId}/messages/${messageId}/snapshot`,
      { method: 'POST', body: { pre_snapshot: preSnapshot } }
    ),

  getModel: (token: string, ref: string) =>
    projectApi<{ model: string; default: string; options: Array<{ label: string; value: string }> }>(
      token, ref, '/copilot/settings/model'
    ),

  setModel: (token: string, ref: string, model: string) =>
    projectApi<{ ok: boolean; model: string }>(
      token, ref, '/copilot/settings/model',
      { method: 'PUT', body: { model } }
    ),
}

export async function streamCopilotChat(
  token: string,
  ref: string,
  sessionId: string,
  body: { message: string; workflow_state: { nodes: unknown[]; edges: unknown[] } },
  onEvent: (event: CopilotStreamEvent) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...aiAuthHeader(token),
  }
  const response = await fetch(
    projectApiUrl(ref, `/copilot/sessions/${sessionId}/chat`),
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
    throw new Error((data as { error?: string }).error || 'Copilot stream request failed')
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
            const event = JSON.parse(raw) as CopilotStreamEvent
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
            const event = JSON.parse(raw) as CopilotStreamEvent
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

// ── Settings API ──────────────────────────────────────────────────────

export interface SettingDef {
  key: string
  label: string
  description: string
  type: 'int' | 'float' | 'str' | 'bool'
  default: unknown
  value: unknown
  advanced: boolean
  min?: number
  max?: number
  choices?: string[]
  subcategory?: string
}

export interface SettingsCategory {
  label: string
  settings: SettingDef[]
}

export interface SettingsResponse {
  categories: Record<string, SettingsCategory>
}

export const settingsApi = {
  getAll: (token: string, ref: string) =>
    projectApi<SettingsResponse>(token, ref, '/settings'),

  update: (token: string, ref: string, settings: Record<string, unknown>) =>
    projectApi<{ ok: boolean; updated: string[] }>(token, ref, '/settings', {
      method: 'PUT',
      body: { settings },
    }),

  resetKey: (token: string, ref: string, key: string) =>
    projectApi<{ ok: boolean; key: string; default: unknown }>(
      token, ref, `/settings/${key}`, { method: 'DELETE' }
    ),

  resetCategory: (token: string, ref: string, category: string) =>
    projectApi<{ ok: boolean; category: string; reset_keys: string[] }>(
      token, ref, '/settings/reset-category', {
        method: 'POST',
        body: { category },
      }
    ),
}

// ── Re-exports from sub-modules ───────────────────────────────────────

export { agentToolsApi, agentKBApi, agentMcpApi, agentHooksApi, databaseMetaApi } from '@/lib/ai-api/agents-api'
export type {
  AgentToolAssignment,
  AgentKBAssignment,
  AgentMcpServer,
  McpDiscoveredTool,
  AgentHook,
  SchemaInfo,
  SchemaTableInfo,
  SchemaColumnInfo,
} from '@/lib/ai-api/agents-api'
export { orchestrationsApi } from '@/lib/ai-api/orchestrations-api'
export type { Orchestration, OrchestrationEntity } from '@/lib/ai-api/orchestrations-api'
export { runsApi, streamOrchestrationRun } from '@/lib/ai-api/runs-api'
export type { OrchestrationRun } from '@/lib/ai-api/runs-api'
export { toolsApi } from '@/lib/ai-api/tools-api'
export type { CustomTool, ToolRule } from '@/lib/ai-api/tools-api'
export { workflowsApi } from '@/lib/ai-api/workflows-api'
export type {
  Workflow,
  WorkflowBlock,
  WorkflowEdge,
  WorkflowDetail,
  BlockLog,
  WorkflowExecution,
} from '@/lib/ai-api/workflows-api'
