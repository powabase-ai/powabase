import { projectApi, SessionExpiredError, API_URL } from '../ai-api'
import { IS_PLATFORM } from '@/lib/constants'

// ── Types ───────────────────────────────────────────────────────────────

export interface AgentToolAssignment {
  id: string
  agent_id: string
  tool_type: string
  tool_name: string
  tool_id: string | null
  config_override: Record<string, unknown> | null
  created_at: string
}

export interface AgentKBAssignment {
  id: string
  agent_id: string
  knowledge_base_id: string
  retrieval_method: string | null
  top_k: number | null
  max_context_tokens: number | null
  created_at: string
  knowledge_base?: { id: string; name: string }
}

export interface AgentMcpServer {
  id: string
  agent_id: string
  name: string
  url: string
  transport: string
  headers: Record<string, string> | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface McpDiscoveredTool {
  name: string
  description: string | null
  input_schema: Record<string, unknown> | null
}

export interface AgentHook {
  id: string
  agent_id: string | null
  orchestration_id: string | null
  event: string
  matcher: string | null
  type: string
  config: Record<string, unknown>
  enabled: boolean
  priority: number
  created_at: string
}

// ── Agent Tool Assignments ──────────────────────────────────────────────

export const agentToolsApi = {
  list: (token: string, ref: string, agentId: string) =>
    projectApi<{ tools: AgentToolAssignment[] }>(token, ref, `/agents/${agentId}/tools`),

  assign: (
    token: string,
    ref: string,
    agentId: string,
    data: {
      tool_type: string
      tool_name: string
      tool_id?: string
      config_override?: Record<string, unknown>
    }
  ) =>
    projectApi<AgentToolAssignment>(token, ref, `/agents/${agentId}/tools`, {
      method: 'POST',
      body: data,
    }),

  remove: (token: string, ref: string, agentId: string, assignmentId: string) =>
    projectApi<{ deleted: boolean }>(token, ref, `/agents/${agentId}/tools/${assignmentId}`, {
      method: 'DELETE',
    }),

  updateConfig: (
    token: string,
    ref: string,
    agentId: string,
    assignmentId: string,
    configOverride: Record<string, unknown>
  ) =>
    projectApi<AgentToolAssignment>(token, ref, `/agents/${agentId}/tools/${assignmentId}`, {
      method: 'PATCH',
      body: { config_override: configOverride },
    }),
}

// ── Agent Knowledge Base Assignments ────────────────────────────────────

export const agentKBApi = {
  list: (token: string, ref: string, agentId: string) =>
    projectApi<{ knowledge_bases: AgentKBAssignment[] }>(
      token,
      ref,
      `/agents/${agentId}/knowledge-bases`
    ),

  assign: (
    token: string,
    ref: string,
    agentId: string,
    data: {
      knowledge_base_id: string
      retrieval_method?: string
      top_k?: number
      max_context_tokens?: number
    }
  ) =>
    projectApi<AgentKBAssignment>(token, ref, `/agents/${agentId}/knowledge-bases`, {
      method: 'POST',
      body: data,
    }),

  remove: (token: string, ref: string, agentId: string, assignmentId: string) =>
    projectApi<{ deleted: boolean }>(token, ref, `/agents/${agentId}/knowledge-bases/${assignmentId}`, {
      method: 'DELETE',
    }),
}

// ── Agent MCP Servers ───────────────────────────────────────────────────

export const agentMcpApi = {
  list: (token: string, ref: string, agentId: string) =>
    projectApi<{ mcp_servers: AgentMcpServer[] }>(token, ref, `/agents/${agentId}/mcp-servers`),

  add: (
    token: string,
    ref: string,
    agentId: string,
    data: { name: string; url: string; transport: string; headers?: Record<string, string> }
  ) =>
    projectApi<AgentMcpServer>(token, ref, `/agents/${agentId}/mcp-servers`, {
      method: 'POST',
      body: data,
    }),

  update: (
    token: string,
    ref: string,
    agentId: string,
    serverId: string,
    data: Partial<{
      name: string
      url: string
      transport: string
      headers: Record<string, string>
      enabled: boolean
    }>
  ) =>
    projectApi<AgentMcpServer>(token, ref, `/agents/${agentId}/mcp-servers/${serverId}`, {
      method: 'PUT',
      body: data,
    }),

  remove: (token: string, ref: string, agentId: string, serverId: string) =>
    projectApi<{ deleted: boolean }>(token, ref, `/agents/${agentId}/mcp-servers/${serverId}`, {
      method: 'DELETE',
    }),

  discoverTools: (token: string, ref: string, agentId: string, serverId: string) =>
    projectApi<{ tools: McpDiscoveredTool[] }>(
      token,
      ref,
      `/agents/${agentId}/mcp-servers/${serverId}/tools`
    ),
}

// ── Schema Introspection (via pg-meta) ──────────────────────────────────

export interface SchemaColumnInfo {
  name: string
  type: string
  nullable: boolean
  is_pk: boolean
}

export interface SchemaTableInfo {
  name: string
  columns: SchemaColumnInfo[]
}

export interface SchemaInfo {
  name: string
  tables: SchemaTableInfo[]
}

const SYSTEM_SCHEMAS = new Set([
  'ai',
  'auth',
  'storage',
  'extensions',
  'graphql',
  'graphql_public',
  'realtime',
  '_realtime',
  'vault',
  'pgsodium',
  'pgsodium_masks',
  'supabase_functions',
  'supabase_migrations',
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'net',
  'cron',
])

interface PgMetaColumn {
  name: string
  data_type: string
  is_nullable: boolean
  is_identity: boolean
}

interface PgMetaTable {
  schema: string
  name: string
  columns: PgMetaColumn[]
  primary_keys?: Array<{ name: string }>
}

export const databaseMetaApi = {
  getSchemasAndTables: async (
    token: string,
    ref: string
  ): Promise<{ schemas: SchemaInfo[] }> => {
    // Self-host has no control plane, so the platform URL below is
    // unreachable. Like storage.ts, this reuses upstream Studio's existing
    // self-hosted pg-meta backend (pages/api/platform/pg-meta/[ref]/tables.ts)
    // rather than a new proxy. That route DOES pass `{ withAuth: true }` to
    // apiWrapper, but apiWrapper only enforces auth `if (IS_PLATFORM &&
    // withAuth)` — since IS_PLATFORM is false here, the check never runs,
    // so no token is needed on this branch.
    const response = IS_PLATFORM
      ? await fetch(`${API_URL}/platform/pg-meta/${ref}/tables?include_columns=true`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      : await fetch(`/api/platform/pg-meta/${ref}/tables?include_columns=true`)
    if (response.status === 401) {
      throw new SessionExpiredError()
    }
    if (!response.ok) throw new Error('Failed to fetch schema metadata')
    const tables: PgMetaTable[] = await response.json()

    const schemaMap = new Map<string, SchemaTableInfo[]>()
    for (const t of tables) {
      if (SYSTEM_SCHEMAS.has(t.schema) || t.schema.startsWith('pg_')) continue
      const pkColumns = new Set((t.primary_keys || []).map((pk: { name: string }) => pk.name))
      const tableInfo: SchemaTableInfo = {
        name: t.name,
        columns: (t.columns || []).map((c) => ({
          name: c.name,
          type: c.data_type,
          nullable: c.is_nullable,
          is_pk: pkColumns.has(c.name),
        })),
      }
      if (!schemaMap.has(t.schema)) schemaMap.set(t.schema, [])
      schemaMap.get(t.schema)!.push(tableInfo)
    }

    const schemas: SchemaInfo[] = []
    for (const [name, schemaTables] of [...schemaMap.entries()].sort()) {
      schemas.push({
        name,
        tables: schemaTables.sort((a, b) => a.name.localeCompare(b.name)),
      })
    }

    return { schemas }
  },
}

// ── Agent Hooks ─────────────────────────────────────────────────────────

export const agentHooksApi = {
  list: (token: string, ref: string, agentId: string) =>
    projectApi<{ hooks: AgentHook[] }>(token, ref, `/agents/${agentId}/hooks`),

  add: (
    token: string,
    ref: string,
    agentId: string,
    data: {
      event: string
      matcher?: string
      type: string
      config: Record<string, unknown>
    }
  ) =>
    projectApi<AgentHook>(token, ref, `/agents/${agentId}/hooks`, {
      method: 'POST',
      body: data,
    }),

  remove: (token: string, ref: string, agentId: string, hookId: string) =>
    projectApi<{ deleted: boolean }>(token, ref, `/agents/${agentId}/hooks/${hookId}`, {
      method: 'DELETE',
    }),
}
