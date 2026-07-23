-- AI Schema for Agentic Project Service
-- This schema contains all AI-related tables: sources, knowledge bases, agents, etc.
-- Users can read/write data but cannot alter the schema structure.

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the AI schema
CREATE SCHEMA IF NOT EXISTS ai;

-- Grant usage to authenticated users
GRANT USAGE ON SCHEMA ai TO authenticated, service_role, anon;

-- =============================================================================
-- Sources Table
-- Stores uploaded files and their extraction status
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    file_type VARCHAR(255) NOT NULL,
    storage_path VARCHAR(1024) NOT NULL,
    extraction_status VARCHAR(50) DEFAULT 'pending'
        CHECK (extraction_status IN ('pending', 'extracting', 'extracted', 'attention_required', 'failed', 'cancelled')),
    derivatives JSONB DEFAULT '{}',
    -- metadata: user-owned tags/labels; never written by the backend.
    -- auto_metadata: backend-managed system state — currently holds
    --   extraction_model (upload preference, read by /reextract),
    --   source_type (e.g. 'url' discriminator),
    --   origin_url (origin URL for URL-ingested sources).
    -- See migration 0015 for the split rationale.
    metadata JSONB DEFAULT '{}',
    auto_metadata JSONB DEFAULT '{}',
    error_message TEXT,
    celery_task_id VARCHAR(255),
    content_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index for content-based duplicate detection.
-- Pre-existing rows (NULL hash) are excluded so legacy data does not interfere.
CREATE UNIQUE INDEX IF NOT EXISTS sources_content_hash_uniq
    ON ai.sources (content_hash) WHERE content_hash IS NOT NULL;

-- =============================================================================
-- Knowledge Bases Table
-- Stores RAG knowledge base configurations
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    indexing_config JSONB DEFAULT '{"strategy": "chunk_embed", "chunk_size": 500, "overlap": 50}',
    retrieval_config JSONB DEFAULT '{"method": "hybrid", "top_k": 5}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Indexed Sources Table
-- Tracks which sources are indexed in which knowledge bases
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.indexed_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id UUID REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID REFERENCES ai.sources(id) ON DELETE CASCADE,
    index_status VARCHAR(50) DEFAULT 'pending'
        CHECK (index_status IN ('pending', 'indexing', 'indexed', 'failed', 'cancelled')),
    indexed_at TIMESTAMPTZ,
    stats JSONB DEFAULT '{}',
    error_message TEXT,
    indexing_config_snapshot JSONB,
    celery_task_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_dispatched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(knowledge_base_id, source_id)
);

-- =============================================================================
-- Chunks Table
-- Stores text chunks for RAG retrieval (embeddings stored in ai.embeddings)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indexed_source_id UUID REFERENCES ai.indexed_sources(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES ai.sources(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    chunk_index INTEGER,
    start_char INTEGER,
    end_char INTEGER,
    tokens INTEGER,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Page Index ToC Table (one row per document — lightweight metadata only)
-- Stores the tree hierarchy (titles, node_ids, summaries) without section text.
-- Phase 1 of retrieval loads only these lightweight records for LLM reasoning.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.page_index_toc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indexed_source_id UUID REFERENCES ai.indexed_sources(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES ai.sources(id) ON DELETE CASCADE,
    doc_name TEXT,
    doc_description TEXT,
    structure JSONB NOT NULL,  -- Tree hierarchy: titles, node_ids, summaries ONLY (no text)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Page Index Nodes Table (one row per section/node)
-- Stores the full text for each tree node. Phase 2 of retrieval fetches
-- only the specific rows the LLM selected from the ToC.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.page_index_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toc_id UUID NOT NULL REFERENCES ai.page_index_toc(id) ON DELETE CASCADE,
    indexed_source_id UUID REFERENCES ai.indexed_sources(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES ai.sources(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    title TEXT,
    depth INTEGER DEFAULT 0,
    parent_node_id TEXT,
    text TEXT NOT NULL,
    line_num INTEGER,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(toc_id, node_id)
);

-- =============================================================================
-- Full Documents Table
-- Stores document-level summaries for the full_document strategy.
-- Searches operate on summary (embeddings stored in ai.embeddings); full text is in Supabase Storage.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.full_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indexed_source_id UUID REFERENCES ai.indexed_sources(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES ai.sources(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    full_text_path VARCHAR(1024) NOT NULL,
    summary_model VARCHAR(255),
    summary_tokens INTEGER,
    full_text_tokens INTEGER,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Doc2JSON Documents Table
-- Stores structured JSON extraction results for the doc2json strategy.
-- Searches operate on summary (embeddings stored in ai.embeddings).
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.doc2json_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indexed_source_id UUID REFERENCES ai.indexed_sources(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES ai.sources(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    extracted_json JSONB NOT NULL,
    json_schema JSONB NOT NULL,
    window_summaries JSONB DEFAULT '[]',
    extraction_model VARCHAR(255),
    summary_tokens INTEGER,
    input_tokens INTEGER,
    window_size INTEGER,
    window_overlap INTEGER,
    window_count INTEGER,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Graph Index ToC Table (one row per document — lightweight metadata only)
-- Same schema as page_index_toc. Stores tree hierarchy for graph_index strategy.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.graph_index_toc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indexed_source_id UUID REFERENCES ai.indexed_sources(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES ai.sources(id) ON DELETE CASCADE,
    doc_name TEXT,
    doc_description TEXT,
    structure JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Graph Index Nodes Table (one row per section/node)
-- Extends page_index_nodes for vector retrieval (embeddings stored in ai.embeddings).
-- meta JSONB contains: summary, prefix_summary, start_page, end_page,
-- referenced_nodes (list of node_id strings), toc_id.
-- enrichment_error TEXT: dedicated column for per-node enrichment errors.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.graph_index_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toc_id UUID NOT NULL REFERENCES ai.graph_index_toc(id) ON DELETE CASCADE,
    indexed_source_id UUID REFERENCES ai.indexed_sources(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES ai.sources(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    title TEXT,
    depth INTEGER DEFAULT 0,
    parent_node_id TEXT,
    text TEXT NOT NULL,
    line_num INTEGER,
    meta JSONB DEFAULT '{}',
    enrichment_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(toc_id, node_id)
);

-- =============================================================================
-- Embeddings Table
-- Stores vector embeddings separately from content tables, allowing any
-- embedding model/dimension without schema changes.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL,
    item_table VARCHAR(50) NOT NULL
        CHECK (item_table IN ('chunks', 'graph_index_nodes', 'full_documents', 'doc2json_documents')),
    indexed_source_id UUID REFERENCES ai.indexed_sources(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES ai.sources(id) ON DELETE CASCADE,
    embedding_model VARCHAR(255) NOT NULL,
    dims SMALLINT NOT NULL,
    embedding VECTOR NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, embedding_model)
);

-- =============================================================================
-- Workflows Table
-- Stores workflow definitions (DAG-based pipelines)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    variables JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    color VARCHAR(50),
    state VARCHAR(20) DEFAULT 'internal' CHECK (state IN ('internal', 'deployed')),
    webhook_armed_until TIMESTAMPTZ,
    schedule_config JSONB DEFAULT NULL,
    schedule_run_count INTEGER DEFAULT 0,
    last_scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Workflow Blocks Table
-- Stores block definitions within a workflow
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.workflow_blocks (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES ai.workflows(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workflow_id, id)
);

-- =============================================================================
-- Workflow Edges Table
-- Stores connections between blocks
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.workflow_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES ai.workflows(id) ON DELETE CASCADE,
    source_block_id UUID NOT NULL,
    target_block_id UUID NOT NULL,
    source_handle VARCHAR(50) DEFAULT 'output',
    target_handle VARCHAR(50) DEFAULT 'input',
    condition VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Workflow Executions Table
-- Stores execution history
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES ai.workflows(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    input JSONB DEFAULT '{}',
    output JSONB DEFAULT '{}',
    block_outputs JSONB DEFAULT '{}',
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Workflow Block Logs Table
-- Stores granular per-block execution data for workflow runs
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.workflow_block_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES ai.workflow_executions(id) ON DELETE CASCADE,
    block_id UUID NOT NULL,
    block_type VARCHAR(50) NOT NULL,
    block_name VARCHAR(255),
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
    execution_order INTEGER NOT NULL,
    duration_ms REAL,
    input JSONB DEFAULT '{}',
    output JSONB DEFAULT '{}',
    error TEXT,
    config_snapshot JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    agent_run_id UUID,
    -- Typed token + model columns for block_type='agent'. Populated by
    -- the backend's workflow-log persistence helper; queried directly
    -- by the observability dashboard for fast aggregation.
    model VARCHAR(128),
    prompt_tokens INT,
    completion_tokens INT,
    reasoning_tokens INT,
    total_tokens INT
);

-- =============================================================================
-- Agents Table
-- Stores agent configurations
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    model VARCHAR(255) NOT NULL DEFAULT 'gpt-4o-mini',
    system_prompt TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Agent Sessions Table
-- Tracks conversation sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    agent_id UUID REFERENCES ai.agents(id) ON DELETE SET NULL,
    user_id UUID,
    session_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Context Handlers Table
-- Encapsulates retrieval operations over knowledge bases
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.context_handlers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    knowledge_base_configs JSONB NOT NULL DEFAULT '[]',
    max_context_tokens INTEGER DEFAULT 32000,
    retrieved_context JSONB,
    metadata JSONB DEFAULT '{}',
    errors JSONB DEFAULT '[]',
    formatted_context TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- =============================================================================
-- Agent Runs Table
-- Individual agent invocations within sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES ai.agent_sessions(id) ON DELETE CASCADE,
    run_id VARCHAR(255) UNIQUE NOT NULL,
    context_handler_id UUID REFERENCES ai.context_handlers(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    input_messages JSONB,
    output_messages JSONB,
    content TEXT,
    retrieved_context JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    parent_orchestration_run_id UUID,
    steps INTEGER,
    events JSONB DEFAULT '[]',
    reasoning_steps JSONB,
    parent_workflow_execution_id UUID,
    -- Denormalized identity + typed token/tool-call cols populated by
    -- the backend; queried directly by the observability dashboard.
    -- Replaces the previous `usage` and `tool_calls` JSONB columns.
    agent_id UUID,
    model VARCHAR(128),
    prompt_tokens INT,
    completion_tokens INT,
    reasoning_tokens INT,
    cached_tokens INT,
    total_tokens INT,
    tool_call_count INT,
    tool_call_error_count INT,
    tool_call_duration_ms_total INT
);

-- =============================================================================
-- Message Citations Table
-- Tracks which context items were cited in agent run responses.
-- item_id is a generic reference to any content table (chunks,
-- graph_index_nodes, page_index_nodes, full_documents, doc2json_documents).
-- No FK constraint since the ID can come from any of those tables.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.message_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES ai.agent_runs(id) ON DELETE CASCADE,
    citation_key SMALLINT NOT NULL,
    item_id UUID,
    source_id UUID REFERENCES ai.sources(id) ON DELETE SET NULL,
    text_excerpt TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(run_id, citation_key)
);

CREATE INDEX IF NOT EXISTS idx_message_citations_run_id ON ai.message_citations(run_id);
CREATE INDEX IF NOT EXISTS idx_message_citations_item_id ON ai.message_citations(item_id);
CREATE INDEX IF NOT EXISTS idx_message_citations_source_id ON ai.message_citations(source_id);

-- =============================================================================
-- Tools Table
-- Stores reusable tool definitions (function schemas for LLM tool calling)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    input_schema JSONB NOT NULL,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Agent Tools Table
-- Assigns tools to agents; supports both catalog tools and ad-hoc tool bindings
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.agent_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai.agents(id) ON DELETE CASCADE,
    tool_id UUID REFERENCES ai.tools(id) ON DELETE CASCADE,
    tool_type VARCHAR(50) NOT NULL,
    tool_name VARCHAR(255) NOT NULL,
    config_override JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Agent Knowledge Bases Table
-- Assigns knowledge bases to agents for ReAct-loop retrieval
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.agent_knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai.agents(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, knowledge_base_id)
);

-- =============================================================================
-- Agent MCP Servers Table
-- Configures MCP (Model Context Protocol) servers for agents
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.agent_mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai.agents(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    transport VARCHAR(50) NOT NULL DEFAULT 'http',
    url TEXT NOT NULL,
    headers JSONB DEFAULT '{}',
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, name)
);

-- =============================================================================
-- Orchestrations Table
-- Stores multi-agent orchestration definitions
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.orchestrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    strategy VARCHAR(50) NOT NULL DEFAULT 'supervisor',
    orchestrator_config JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Orchestration Entities Table
-- Maps agents/tools/knowledge bases into an orchestration with roles
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.orchestration_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orchestration_id UUID NOT NULL REFERENCES ai.orchestrations(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_ref_id UUID NOT NULL,
    role_description TEXT,
    config JSONB DEFAULT '{}',
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Orchestration Sessions Table
-- Tracks conversation sessions for orchestrations
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.orchestration_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    orchestration_id UUID REFERENCES ai.orchestrations(id) ON DELETE SET NULL,
    user_id UUID,
    session_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Orchestration Runs Table
-- Individual orchestration invocations within sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.orchestration_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES ai.orchestration_sessions(id) ON DELETE CASCADE,
    run_id VARCHAR(255) UNIQUE NOT NULL,
    orchestration_id UUID REFERENCES ai.orchestrations(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'running',
    input_messages JSONB,
    content TEXT,
    events JSONB DEFAULT '[]',
    error TEXT,
    reasoning_requested BOOLEAN,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Typed token + model cols populated by the backend.
    -- Replaces the previous `usage` JSONB column.
    model VARCHAR(128),
    prompt_tokens INT,
    completion_tokens INT,
    reasoning_tokens INT,
    cached_tokens INT,
    total_tokens INT,
    tool_call_count INT,
    tool_call_error_count INT,
    tool_call_duration_ms_total INT
);

-- FK constraint on agent_runs.parent_orchestration_run_id (column added in 0005)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_agent_runs_parent_orch_run'
    ) THEN
        ALTER TABLE ai.agent_runs
            ADD CONSTRAINT fk_agent_runs_parent_orch_run
            FOREIGN KEY (parent_orchestration_run_id)
            REFERENCES ai.orchestration_runs(id) ON DELETE SET NULL;
    END IF;
END $$;

-- FK constraint on agent_runs.parent_workflow_execution_id (column added in 0016)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_agent_runs_parent_wf_exec'
    ) THEN
        ALTER TABLE ai.agent_runs
            ADD CONSTRAINT fk_agent_runs_parent_wf_exec
            FOREIGN KEY (parent_workflow_execution_id)
            REFERENCES ai.workflow_executions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- FK constraint on workflow_block_logs.agent_run_id (column added in 0016)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_wf_block_logs_agent_run'
    ) THEN
        ALTER TABLE ai.workflow_block_logs
            ADD CONSTRAINT fk_wf_block_logs_agent_run
            FOREIGN KEY (agent_run_id)
            REFERENCES ai.agent_runs(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- Hooks Table
-- Event hooks for agents and orchestrations
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.hooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES ai.agents(id) ON DELETE CASCADE,
    orchestration_id UUID REFERENCES ai.orchestrations(id) ON DELETE CASCADE,
    event VARCHAR(50) NOT NULL,
    matcher VARCHAR(255),
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (agent_id IS NOT NULL OR orchestration_id IS NOT NULL)
);

-- =============================================================================
-- Enrichment Configs Table
-- Stores metadata enrichment field definitions per knowledge base (1:0..1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.enrichment_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id UUID NOT NULL UNIQUE REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    fields JSONB NOT NULL DEFAULT '[]',
    llm_model VARCHAR(255),
    max_tokens INTEGER DEFAULT 2000,
    use_multimodal BOOLEAN DEFAULT FALSE,
    metadata_table_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'idle'
        CHECK (status IN ('idle', 'enriching', 'completed', 'completed_with_errors', 'failed')),
    enriched_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    error_message TEXT,
    celery_task_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Project Settings Table
-- Key-value store for project-level configuration (e.g. copilot model)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.project_settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Copilot Sessions Table
-- Tracks AI copilot chat sessions per workflow
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.copilot_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES ai.workflows(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Copilot Messages Table
-- Stores conversation messages for copilot sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.copilot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai.copilot_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    workflow_diff JSONB,
    pre_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Tool Call Events Table
-- One row per tool invocation within an agent/orchestration/workflow run.
-- Powers the observability dashboards' per-tool charts (calls by tool, p95
-- duration, error rate) and per-run drill-down. Denormalized agent_id/model
-- let the dashboard filter without joining back to agent_runs.
-- =============================================================================
-- `arguments` and `result` keep the full tool-call payload (JSONB) so multimodal
-- tool responses (image_ref blocks etc.) round-trip cleanly through the API's
-- tool_calls reader. `*_preview` are short text truncations for grids.
CREATE TABLE IF NOT EXISTS ai.tool_call_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id UUID REFERENCES ai.agent_runs(id) ON DELETE CASCADE,
    orchestration_run_id UUID REFERENCES ai.orchestration_runs(id) ON DELETE CASCADE,
    workflow_execution_id UUID REFERENCES ai.workflow_executions(id) ON DELETE CASCADE,
    agent_id UUID,
    model VARCHAR(128),
    tool_name VARCHAR(255) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('success', 'error')),
    duration_ms INTEGER,
    arguments JSONB,
    result JSONB,
    arguments_preview TEXT,
    result_preview TEXT,
    error TEXT,
    step INTEGER,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================

-- Standard B-tree indexes
CREATE INDEX IF NOT EXISTS idx_ai_chunks_kb_id ON ai.chunks (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_source_id ON ai.chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_indexed_source_id ON ai.chunks (indexed_source_id);
CREATE INDEX IF NOT EXISTS idx_ai_indexed_sources_kb_id ON ai.indexed_sources (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_indexed_sources_source_id ON ai.indexed_sources (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_sources_status ON ai.sources (extraction_status);

-- Tool call events indexes
CREATE INDEX IF NOT EXISTS idx_tool_call_events_tool_occurred
    ON ai.tool_call_events (tool_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_call_events_agent_occurred
    ON ai.tool_call_events (agent_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_call_events_run
    ON ai.tool_call_events (agent_run_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_events_orch_run
    ON ai.tool_call_events (orchestration_run_id);

-- Page index toc indexes
CREATE INDEX IF NOT EXISTS idx_ai_page_index_toc_kb_id ON ai.page_index_toc (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_page_index_toc_source_id ON ai.page_index_toc (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_page_index_toc_indexed_source_id ON ai.page_index_toc (indexed_source_id);

-- Page index nodes indexes
CREATE INDEX IF NOT EXISTS idx_ai_page_index_nodes_kb_id ON ai.page_index_nodes (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_page_index_nodes_source_id ON ai.page_index_nodes (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_page_index_nodes_indexed_source_id ON ai.page_index_nodes (indexed_source_id);
CREATE INDEX IF NOT EXISTS idx_ai_page_index_nodes_toc_node ON ai.page_index_nodes (toc_id, node_id);
CREATE INDEX IF NOT EXISTS idx_ai_page_index_nodes_text_search
    ON ai.page_index_nodes USING gin (to_tsvector('english', text));

-- Graph index toc indexes
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_toc_kb_id ON ai.graph_index_toc (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_toc_source_id ON ai.graph_index_toc (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_toc_indexed_source_id ON ai.graph_index_toc (indexed_source_id);

-- Graph index nodes indexes
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_nodes_kb_id ON ai.graph_index_nodes (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_nodes_source_id ON ai.graph_index_nodes (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_nodes_indexed_source_id ON ai.graph_index_nodes (indexed_source_id);
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_nodes_toc_node ON ai.graph_index_nodes (toc_id, node_id);
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_nodes_toc_parent ON ai.graph_index_nodes (toc_id, parent_node_id);
CREATE INDEX IF NOT EXISTS idx_ai_graph_index_nodes_text_search
    ON ai.graph_index_nodes USING gin (to_tsvector('english', text));

-- Full documents indexes
CREATE INDEX IF NOT EXISTS idx_ai_full_documents_kb_id ON ai.full_documents (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_full_documents_source_id ON ai.full_documents (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_full_documents_indexed_source_id ON ai.full_documents (indexed_source_id);
CREATE INDEX IF NOT EXISTS idx_ai_full_documents_summary_search
    ON ai.full_documents USING gin (to_tsvector('english', summary));

-- Doc2JSON documents indexes
CREATE INDEX IF NOT EXISTS idx_ai_doc2json_documents_kb_id ON ai.doc2json_documents (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_doc2json_documents_source_id ON ai.doc2json_documents (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_doc2json_documents_indexed_source_id ON ai.doc2json_documents (indexed_source_id);
CREATE INDEX IF NOT EXISTS idx_ai_doc2json_documents_summary_search
    ON ai.doc2json_documents USING gin (to_tsvector('english', summary));

-- Workflow indexes
CREATE INDEX IF NOT EXISTS idx_ai_workflow_blocks_wf ON ai.workflow_blocks (workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_edges_wf ON ai.workflow_edges (workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_executions_wf ON ai.workflow_executions (workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_executions_status ON ai.workflow_executions (status);

-- Workflow block logs indexes
CREATE INDEX IF NOT EXISTS idx_wf_block_logs_exec ON ai.workflow_block_logs (execution_id);
CREATE INDEX IF NOT EXISTS idx_wf_block_logs_exec_order ON ai.workflow_block_logs (execution_id, execution_order);

CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_agent_id ON ai.agent_sessions (agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_session_id ON ai.agent_runs (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_status ON ai.agent_runs (status);
CREATE INDEX IF NOT EXISTS idx_ai_context_handlers_status ON ai.context_handlers (status);
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_context_handler_id ON ai.agent_runs (context_handler_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_parent_orch_run ON ai.agent_runs (parent_orchestration_run_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_parent_wf_exec ON ai.agent_runs (parent_workflow_execution_id);
CREATE INDEX IF NOT EXISTS idx_wf_block_logs_agent_run ON ai.workflow_block_logs (agent_run_id);
-- Dashboard paths (filter by model/agent over a time window).
CREATE INDEX IF NOT EXISTS idx_agent_runs_model_created ON ai.agent_runs (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_created ON ai.agent_runs (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created ON ai.agent_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_runs_model_created ON ai.orchestration_runs (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_runs_status_created ON ai.orchestration_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_block_logs_type_created ON ai.workflow_block_logs (block_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_block_logs_model_created ON ai.workflow_block_logs (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tools_agent_id ON ai.agent_tools (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_kb_agent_id ON ai.agent_knowledge_bases (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_mcp_servers_agent_id ON ai.agent_mcp_servers (agent_id);

-- Hooks indexes
CREATE INDEX IF NOT EXISTS idx_hooks_agent_id ON ai.hooks (agent_id);
CREATE INDEX IF NOT EXISTS idx_hooks_orchestration_id ON ai.hooks (orchestration_id);

-- Orchestration indexes
CREATE INDEX IF NOT EXISTS idx_orch_entities_orch_id ON ai.orchestration_entities (orchestration_id);
CREATE INDEX IF NOT EXISTS idx_orch_sessions_orch_id ON ai.orchestration_sessions (orchestration_id);
CREATE INDEX IF NOT EXISTS idx_orch_runs_session_id ON ai.orchestration_runs (session_id);
CREATE INDEX IF NOT EXISTS idx_orch_runs_orch_id ON ai.orchestration_runs (orchestration_id);
CREATE INDEX IF NOT EXISTS idx_orch_runs_status ON ai.orchestration_runs (status);

-- Full-text search index for chunks
CREATE INDEX IF NOT EXISTS idx_ai_chunks_text_search
    ON ai.chunks USING gin (to_tsvector('english', text));

-- Embeddings indexes (lookup + partial ANN per common dimension)
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_item_id ON ai.embeddings (item_id);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_kb_id ON ai.embeddings (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_source_id ON ai.embeddings (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_indexed_source_id ON ai.embeddings (indexed_source_id);

CREATE INDEX IF NOT EXISTS idx_ai_embeddings_hnsw_1536
    ON ai.embeddings USING hnsw ((embedding::vector(1536)) vector_cosine_ops)
    WHERE dims = 1536;

-- Enrichment configs indexes
CREATE INDEX IF NOT EXISTS idx_enrichment_configs_kb ON ai.enrichment_configs (knowledge_base_id);

-- Copilot indexes
CREATE INDEX IF NOT EXISTS idx_copilot_sessions_workflow ON ai.copilot_sessions (workflow_id);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_session ON ai.copilot_messages (session_id, created_at);

-- =============================================================================
-- Row Level Security (RLS) Policies
-- Users can read/write data but schema is protected
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE ai.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.indexed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.page_index_toc ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.page_index_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.full_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.doc2json_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.graph_index_toc ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.graph_index_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.context_handlers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.enrichment_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.workflow_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.workflow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.workflow_block_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.project_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.copilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.agent_knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.agent_mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.orchestrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.orchestration_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.orchestration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.orchestration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.tool_call_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by project-service backend)
CREATE POLICY service_role_all_sources ON ai.sources
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_knowledge_bases ON ai.knowledge_bases
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_indexed_sources ON ai.indexed_sources
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_chunks ON ai.chunks
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_page_index_toc ON ai.page_index_toc
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_page_index_nodes ON ai.page_index_nodes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_full_documents ON ai.full_documents
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_doc2json_documents ON ai.doc2json_documents
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_graph_index_toc ON ai.graph_index_toc
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_graph_index_nodes ON ai.graph_index_nodes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_agents ON ai.agents
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_agent_sessions ON ai.agent_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_agent_runs ON ai.agent_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_context_handlers ON ai.context_handlers
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_enrichment_configs ON ai.enrichment_configs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_workflows ON ai.workflows
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_workflow_blocks ON ai.workflow_blocks
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_workflow_edges ON ai.workflow_edges
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_workflow_executions ON ai.workflow_executions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_workflow_block_logs ON ai.workflow_block_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_embeddings ON ai.embeddings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_project_settings ON ai.project_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_copilot_sessions ON ai.copilot_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_copilot_messages ON ai.copilot_messages
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tools ON ai.tools
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_agent_tools ON ai.agent_tools
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_agent_knowledge_bases ON ai.agent_knowledge_bases
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_agent_mcp_servers ON ai.agent_mcp_servers
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_hooks ON ai.hooks
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_orchestrations ON ai.orchestrations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_orchestration_entities ON ai.orchestration_entities
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_orchestration_sessions ON ai.orchestration_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_orchestration_runs ON ai.orchestration_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tool_call_events ON ai.tool_call_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read all data
CREATE POLICY auth_read_sources ON ai.sources
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_knowledge_bases ON ai.knowledge_bases
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_indexed_sources ON ai.indexed_sources
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_chunks ON ai.chunks
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_page_index_toc ON ai.page_index_toc
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_page_index_nodes ON ai.page_index_nodes
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_full_documents ON ai.full_documents
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_doc2json_documents ON ai.doc2json_documents
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_graph_index_toc ON ai.graph_index_toc
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_graph_index_nodes ON ai.graph_index_nodes
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_agents ON ai.agents
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_agent_sessions ON ai.agent_sessions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_agent_runs ON ai.agent_runs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_context_handlers ON ai.context_handlers
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_enrichment_configs ON ai.enrichment_configs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_workflows ON ai.workflows
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_workflow_blocks ON ai.workflow_blocks
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_workflow_edges ON ai.workflow_edges
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_workflow_executions ON ai.workflow_executions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_workflow_block_logs ON ai.workflow_block_logs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_embeddings ON ai.embeddings
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_project_settings ON ai.project_settings
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_copilot_sessions ON ai.copilot_sessions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_copilot_messages ON ai.copilot_messages
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_tool_call_events ON ai.tool_call_events
    FOR SELECT TO authenticated USING (true);

CREATE POLICY auth_write_project_settings ON ai.project_settings
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_project_settings ON ai.project_settings
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_project_settings ON ai.project_settings
    FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_write_copilot_sessions ON ai.copilot_sessions
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_copilot_sessions ON ai.copilot_sessions
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_copilot_sessions ON ai.copilot_sessions
    FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_write_copilot_messages ON ai.copilot_messages
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_copilot_messages ON ai.copilot_messages
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_copilot_messages ON ai.copilot_messages
    FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_read_tools ON ai.tools
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_agent_tools ON ai.agent_tools
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_agent_knowledge_bases ON ai.agent_knowledge_bases
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_agent_mcp_servers ON ai.agent_mcp_servers
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_hooks ON ai.hooks
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_orchestrations ON ai.orchestrations
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_orchestration_entities ON ai.orchestration_entities
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_orchestration_sessions ON ai.orchestration_sessions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_orchestration_runs ON ai.orchestration_runs
    FOR SELECT TO authenticated USING (true);

-- Authenticated users can write to most tables
-- (Sources are typically uploaded via the backend, but allow for direct API usage)
CREATE POLICY auth_write_sources ON ai.sources
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_sources ON ai.sources
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_write_knowledge_bases ON ai.knowledge_bases
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_knowledge_bases ON ai.knowledge_bases
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_knowledge_bases ON ai.knowledge_bases
    FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_write_agents ON ai.agents
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_agents ON ai.agents
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_agents ON ai.agents
    FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_write_workflows ON ai.workflows
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_workflows ON ai.workflows
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_workflows ON ai.workflows
    FOR DELETE TO authenticated USING (true);

CREATE POLICY auth_write_workflow_blocks ON ai.workflow_blocks
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_write_workflow_edges ON ai.workflow_edges
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_write_workflow_executions ON ai.workflow_executions
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_workflow_executions ON ai.workflow_executions
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_write_workflow_block_logs ON ai.workflow_block_logs
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_workflow_block_logs ON ai.workflow_block_logs
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_delete_indexed_sources ON ai.indexed_sources
    FOR DELETE TO authenticated USING (true);

-- Agent sessions - users can only see their own sessions (if user_id is set)
-- For shared sessions (user_id is null), everyone can see them
CREATE POLICY auth_read_own_sessions ON ai.agent_sessions
    FOR SELECT TO authenticated 
    USING (user_id IS NULL OR user_id = auth.uid());
    
CREATE POLICY auth_write_sessions ON ai.agent_sessions
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_own_sessions ON ai.agent_sessions
    FOR UPDATE TO authenticated 
    USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (true);

-- Agent runs - follow session permissions
CREATE POLICY auth_read_runs ON ai.agent_runs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_write_runs ON ai.agent_runs
    FOR INSERT TO authenticated WITH CHECK (true);

-- Tools - authenticated users can read, write, update, and delete
CREATE POLICY auth_write_tools ON ai.tools
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_tools ON ai.tools
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_tools ON ai.tools
    FOR DELETE TO authenticated USING (true);

-- Agent tools - authenticated users can read, write, and delete
CREATE POLICY auth_write_agent_tools ON ai.agent_tools
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_delete_agent_tools ON ai.agent_tools
    FOR DELETE TO authenticated USING (true);

-- Agent knowledge bases - authenticated users can read, write, and delete
CREATE POLICY auth_write_agent_knowledge_bases ON ai.agent_knowledge_bases
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_delete_agent_knowledge_bases ON ai.agent_knowledge_bases
    FOR DELETE TO authenticated USING (true);

-- Agent MCP servers - authenticated users can read, write, update, and delete
CREATE POLICY auth_write_agent_mcp_servers ON ai.agent_mcp_servers
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_agent_mcp_servers ON ai.agent_mcp_servers
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_agent_mcp_servers ON ai.agent_mcp_servers
    FOR DELETE TO authenticated USING (true);

-- Context handlers - authenticated users can read, create, and update
CREATE POLICY auth_write_context_handlers ON ai.context_handlers
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_context_handlers ON ai.context_handlers
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Enrichment configs - authenticated users can read, write, update, and delete
CREATE POLICY auth_write_enrichment_configs ON ai.enrichment_configs
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_enrichment_configs ON ai.enrichment_configs
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_enrichment_configs ON ai.enrichment_configs
    FOR DELETE TO authenticated USING (true);

-- Hooks - authenticated users can CRUD
CREATE POLICY auth_write_hooks ON ai.hooks
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_hooks ON ai.hooks
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_hooks ON ai.hooks
    FOR DELETE TO authenticated USING (true);

-- Orchestrations - authenticated users can CRUD
CREATE POLICY auth_write_orchestrations ON ai.orchestrations
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_orchestrations ON ai.orchestrations
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_orchestrations ON ai.orchestrations
    FOR DELETE TO authenticated USING (true);

-- Orchestration entities - authenticated users can write and delete
CREATE POLICY auth_write_orchestration_entities ON ai.orchestration_entities
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_delete_orchestration_entities ON ai.orchestration_entities
    FOR DELETE TO authenticated USING (true);

-- Orchestration sessions - users can see their own or shared sessions
CREATE POLICY auth_read_own_orch_sessions ON ai.orchestration_sessions
    FOR SELECT TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY auth_write_orch_sessions ON ai.orchestration_sessions
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_own_orch_sessions ON ai.orchestration_sessions
    FOR UPDATE TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (true);

-- Orchestration runs - authenticated users can read and write
CREATE POLICY auth_write_orchestration_runs ON ai.orchestration_runs
    FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================================================
-- Grant permissions on tables
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA ai TO anon;

-- Grant sequence usage for auto-generated IDs
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai TO service_role;


-- =============================================================================
-- Updated At Trigger Function
-- =============================================================================
CREATE OR REPLACE FUNCTION ai.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables with updated_at column
CREATE TRIGGER set_updated_at_sources
    BEFORE UPDATE ON ai.sources
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_knowledge_bases
    BEFORE UPDATE ON ai.knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_workflows
    BEFORE UPDATE ON ai.workflows
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_agents
    BEFORE UPDATE ON ai.agents
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_agent_sessions
    BEFORE UPDATE ON ai.agent_sessions
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_agent_mcp_servers
    BEFORE UPDATE ON ai.agent_mcp_servers
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_enrichment_configs
    BEFORE UPDATE ON ai.enrichment_configs
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_copilot_sessions
    BEFORE UPDATE ON ai.copilot_sessions
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_tools
    BEFORE UPDATE ON ai.tools
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_orchestrations
    BEFORE UPDATE ON ai.orchestrations
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_orchestration_sessions
    BEFORE UPDATE ON ai.orchestration_sessions
    FOR EACH ROW EXECUTE FUNCTION ai.trigger_set_updated_at();

-- =============================================================================
-- Trigger: clean up enrichment metadata when indexed_sources are deleted
-- =============================================================================
CREATE OR REPLACE FUNCTION ai.cleanup_enrichment_metadata()
RETURNS TRIGGER AS $$
DECLARE
    _meta_table TEXT;
BEGIN
    SELECT metadata_table_name INTO _meta_table
    FROM ai.enrichment_configs
    WHERE knowledge_base_id = OLD.knowledge_base_id;

    IF _meta_table IS NULL OR LEFT(_meta_table, 12) != 'kb_metadata_' THEN
        RETURN OLD;
    END IF;

    BEGIN
        EXECUTE format(
            'DELETE FROM ai.%I WHERE item_id IN ('
            '  SELECT id FROM ai.chunks WHERE indexed_source_id = $1'
            '  UNION ALL'
            '  SELECT id FROM ai.page_index_nodes WHERE indexed_source_id = $1'
            '  UNION ALL'
            '  SELECT id FROM ai.full_documents WHERE indexed_source_id = $1'
            '  UNION ALL'
            '  SELECT id FROM ai.graph_index_nodes WHERE indexed_source_id = $1'
            ')',
            _meta_table
        ) USING OLD.id;
    EXCEPTION
        WHEN undefined_table THEN NULL;
    END;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = ai;

CREATE TRIGGER cleanup_enrichment_metadata_on_indexed_source_delete
    BEFORE DELETE ON ai.indexed_sources
    FOR EACH ROW
    EXECUTE FUNCTION ai.cleanup_enrichment_metadata();

-- =============================================================================
-- AI Provider Keys Table
-- Stores per-project LLM provider API keys encrypted at rest.
-- One row per provider (openai, anthropic, google, openrouter).
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai.ai_provider_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL UNIQUE,
    api_key_encrypted TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    last_validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Server-side rollup for the control-plane observability dashboard.
-- Replaces the previous "fetch up to 20k row dicts via PostgREST and
-- aggregate in Python" path: callers POST to
-- /rest/v1/rpc/observability_agent_run_buckets and get back one row per
-- non-empty bucket window. Total run count, total tokens, and overall
-- last activity are summed/maxed in Python over the (bounded) bucket set.
-- Mirrored in migration 0019.
-- =============================================================================
CREATE OR REPLACE FUNCTION ai.observability_agent_run_buckets(
    since timestamptz,
    bucket_trunc text
)
RETURNS TABLE (
    bucket timestamptz,
    total_runs bigint,
    failed_runs bigint,
    total_tokens bigint,
    last_activity_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ai, pg_temp
AS $$
    SELECT
        date_trunc(bucket_trunc, ar.created_at) AS bucket,
        COUNT(*)::bigint AS total_runs,
        COUNT(*) FILTER (WHERE ar.status = 'failed')::bigint AS failed_runs,
        COALESCE(SUM(ar.total_tokens), 0)::bigint AS total_tokens,
        MAX(ar.created_at) AS last_activity_at
    FROM ai.agent_runs ar
    WHERE ar.created_at >= since
      AND bucket_trunc IN ('minute', 'hour', 'day')
    GROUP BY date_trunc(bucket_trunc, ar.created_at)
    ORDER BY bucket;
$$;

-- Authenticated/service_role only — anon excluded because run-volume
-- aggregates leak tenant activity even without row-level data.
GRANT EXECUTE ON FUNCTION ai.observability_agent_run_buckets(timestamptz, text)
    TO authenticated, service_role;

-- ── List-pagination supporting indexes (added 2026-05-21) ─────────────
--
-- Composite indexes for the per-row aggregate subselects in the paginated
-- KB / Orchestrations list endpoints. agent_runs(agent_id, created_at DESC),
-- orchestration_entities(orchestration_id), and orchestration_sessions(orchestration_id)
-- are also referenced by the queries but are already indexed earlier in
-- this file under different names (idx_agent_runs_agent_created,
-- idx_orch_entities_orch_id, idx_orch_sessions_orch_id).

CREATE INDEX IF NOT EXISTS idx_indexed_sources_kb_status
    ON ai.indexed_sources (knowledge_base_id, index_status);

CREATE INDEX IF NOT EXISTS idx_orch_runs_session_created
    ON ai.orchestration_runs (session_id, created_at DESC);

-- ── list_sources_excluding_kb RPC (added 2026-06-03) ──────────────────
-- Used by the Studio "Add sources to knowledge base" modal to list
-- extracted sources that are NOT already in the given KB. The NOT EXISTS
-- subquery is fast (indexed on (knowledge_base_id, source_id)) and
-- scales to projects with hundreds of thousands of sources without
-- forcing the frontend to load every row.
CREATE OR REPLACE FUNCTION ai.list_sources_excluding_kb(
    p_kb_id uuid,
    p_search text DEFAULT NULL,
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    file_type varchar(255),
    storage_path varchar(1024),
    extraction_status varchar(50),
    derivatives jsonb,
    metadata jsonb,
    total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ai, pg_temp
AS $$
    WITH eligible AS (
        SELECT s.id, s.name, s.file_type, s.storage_path,
               s.extraction_status, s.derivatives, s.metadata
        FROM ai.sources s
        WHERE s.extraction_status = 'extracted'
          AND NOT EXISTS (
              SELECT 1 FROM ai.indexed_sources i
              WHERE i.source_id = s.id
                AND i.knowledge_base_id = p_kb_id
          )
          AND (
              p_search IS NULL
              OR p_search = ''
              -- Escape ILIKE's %, _, and the default backslash escape so
              -- a user typing ``invoice_2024`` matches the literal
              -- underscore. Backslash first so the % and _ replacements
              -- don't recurse on themselves.
              OR s.name ILIKE
                 '%' ||
                 replace(replace(replace(p_search,
                                         E'\\', E'\\\\'),
                                 '%', E'\\%'),
                         '_', E'\\_') ||
                 '%' ESCAPE E'\\'
          )
    ),
    -- COUNT(*) OVER () computes per-row, so when ``eligible`` yields
    -- zero rows the ``counted`` CTE also yields zero rows — i.e. the
    -- RPC returns NO row at all (not a single row with total_count=0).
    -- Callers must read total_count from rows[0] when present and
    -- treat empty result as zero. See Studio FE handler.
    counted AS (
        SELECT *, COUNT(*) OVER ()::bigint AS total_count
        FROM eligible
    )
    SELECT id, name, file_type, storage_path, extraction_status,
           derivatives, metadata, total_count
    FROM counted
    ORDER BY name ASC, id ASC
    LIMIT GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION ai.list_sources_excluding_kb(uuid, text, int, int)
    TO authenticated, service_role;
