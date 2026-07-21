import { getAccessToken, useParams } from 'common'
import { useEffect, useMemo, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { useProjectDetailQuery } from '@/data/projects/project-detail-query'
import { hasAiAuth } from '@/lib/ai-api'

// ── Database types for the ai schema ──────────────────────────────────

export interface Source {
  id: string
  name: string
  file_type: string
  storage_path?: string
  extraction_status: string
  metadata?: Record<string, unknown>
  auto_metadata?: Record<string, unknown>
  error_message?: string | null
  derivatives?: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  indexing_config: Record<string, unknown>
  retrieval_config: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
  // ─── List-page aggregates (returned by knowledgeBasesApi.list) ────────
  source_counts?: {
    pending: number
    indexing: number
    indexed: number
    failed: number
    cancelled: number
    total: number
  }
  chunk_count?: number
  enrichment_status?: 'none' | 'enriching' | 'enriched' | 'failed'
  enrichment_progress?: { enriched_count: number; total_count: number } | null
}

export interface IndexedSource {
  id: string
  knowledge_base_id: string
  source_id: string
  index_status: string
  indexed_at: string | null
  stats: Record<string, unknown>
  error_message: string | null
  indexing_config_snapshot?: Record<string, unknown>
}

export interface Chunk {
  id: string
  indexed_source_id: string
  text: string
  chunk_index: number | null
  start_char: number | null
  end_char: number | null
  metadata: Record<string, unknown>
  embedding?: number[]
  created_at: string | null
}

export interface Agent {
  id: string
  name: string
  model: string
  system_prompt: string | null
  settings: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
  // ─── List-page aggregates (returned by agentsApi.list) ────────────────
  session_count?: number
  total_runs?: number
  last_run_at?: string | null
}

export interface AgentRun {
  id: string
  agent_id?: string
  /** Denormalized model string ("gpt-5-mini", "claude-3-7-sonnet", etc.).
   *  Populated by services/session.py. May be NULL on legacy rows. */
  model?: string | null
  session_id: string
  status: string
  created_at: string | null
  run_id?: string
  input_messages?: Array<{ role: string; content: string }>
  output_messages?: Array<{ role: string; content: string }>
  content?: string | null
  usage?: Record<string, number> | null
  retrieved_context?: unknown | null
  error?: string | null
  started_at?: string | null
  completed_at?: string | null
}

export interface AgentSession {
  id: string
  agent_id: string
  created_at: string | null
}

// ── Supabase client routed through control plane ──────────────────────
// Uses the real @supabase/supabase-js client, pointed at
// /api/platform/rest/{ref}/ (our control plane proxy → project PostgREST).
// The browser never connects to project Kong directly.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

// ── Exported types ────────────────────────────────────────────────────

export type ProjectClient = SupabaseClient | null

export interface UseProjectSupabaseClientReturn {
  /**
   * Supabase client routed through /api/platform/rest/{ref}/, bound to ai schema. Null until ready.
   *
   * @deprecated As of C2.1, every application call site has been migrated off
   * `.from()`/`.rpc()` on this client onto project-service `/api/*` endpoints
   * (see `@/lib/ai-api`) — C2.2 removes `ai` from the per-project PGRST
   * schema list, at which point `.from()`/`.rpc()` calls on this client will
   * 404/error. Do not add new `.from()`/`.rpc()` call sites; add a
   * project-service route + `ai-api.ts` wrapper instead. Kept only because
   * removing the field outright is bundled with the C2.2 schema-lockdown
   * work, not this migration.
   */
  client: ProjectClient
  /** GoTrue access token for Project Service API calls (ai-api.ts). */
  token: string
  /** Project ref from URL. */
  ref: string
  /** Org slug (from project detail). */
  orgSlug: string
  /** Project slug (from project detail). */
  projectSlug: string
  /** True once token + project detail are loaded. */
  isReady: boolean
}

/**
 * Hook for AI pages to access project data.
 *
 * `token` + `ref` are the live surface — pass them to the `@/lib/ai-api`
 * wrappers (`agentsApi`, `knowledgeBasesApi`, `kbInspectorApi`,
 * `observabilityApi`, ...), which call project-service `/api/*` endpoints.
 *
 * `client` (a real @supabase/supabase-js client bound to the `ai` schema via
 * the control-plane PostgREST proxy) is deprecated — see the `@deprecated`
 * note on `UseProjectSupabaseClientReturn.client`. Do not write new code
 * against it.
 *
 * Usage:
 *   const { token, ref, isReady } = useProjectSupabaseClient()
 *   const agent = await agentsApi.get(token, ref, agentId)
 */
export function useProjectSupabaseClient(): UseProjectSupabaseClientReturn {
  const { ref } = useParams()
  const { data: project, isLoading } = useProjectDetailQuery({ ref })
  const [token, setToken] = useState<string>('')

  useEffect(() => {
    getAccessToken().then((t) => {
      if (t) setToken(t)
    })
  }, [])

  const client = useMemo(() => {
    if (!ref || !token) return null
    const url = `${API_URL}/platform/rest/${ref}`
    // Only the PostgREST surface (.from/.select/.insert/.update/.delete/.rpc)
    // routes through the control-plane proxy. .channel/.auth/.storage/.functions
    // hit separate paths that the proxy does not expose — do not use them on this
    // client. For storage/realtime/auth-admin, use createProjectSupabaseClient()
    // from @/lib/project-supabase-client instead.
    //
    // `'ai' as never` casts past the SchemaName constraint: without a typed
    // Database generic, SchemaName defaults to 'public' and 'ai' isn't assignable.
    // Using explicit generics (createClient<any, 'ai'>) makes the return type a
    // 5-param specialisation that doesn't match our ProjectClient alias.
    return createClient(url, token, {
      db: { schema: 'ai' as never },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      },
    })
  }, [ref, token])

  return {
    client,
    token,
    ref: (ref as string) ?? '',
    orgSlug: (project as any)?.organization_id ?? '',
    projectSlug: (project as any)?.slug ?? (ref as string) ?? '',
    // Platform: unchanged — requires the real GoTrue token (hasAiAuth ===
    // !!token there). Self-host: there is no per-user browser token (Kong
    // basic-auth gates Studio, not a GoTrue session — see auth.tsx
    // alwaysLoggedIn), so hasAiAuth is always true and readiness depends
    // only on the project detail load; the project-api proxy injects the
    // real service_role credential server-side regardless.
    isReady: !isLoading && !!project && hasAiAuth(token),
  }
}
