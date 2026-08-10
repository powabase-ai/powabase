/**
 * Templatized guide-bubble sequences.
 *
 * Each sequence is an ordered list of steps; a step highlights a UI element
 * (by anchor), shows a short explanation + optional docs link, and declares the
 * route it lives on so the engine can navigate there before showing the bubble.
 * The Project Copilot launches a sequence by emitting `trigger_guide` with the
 * sequence `id` — kept in sync with the backend's GUIDE_SEQUENCE_IDS.
 */
import { type Feature } from 'common'
import { type OnboardingAnchorId, ONBOARDING_ANCHORS } from './onboarding-anchors'

export type GuidePlacement = 'top' | 'bottom' | 'left' | 'right'

export interface GuideStep {
  anchor: OnboardingAnchorId
  title: string
  body: string
  docsUrl?: string
  route?: string
  placement?: GuidePlacement
  waitForUserAction?: boolean
}

export type GuideFeature =
  | 'connect' | 'sources' | 'tables' | 'knowledge-bases' | 'agents'
  | 'orchestrations' | 'workflows' | 'sql' | 'storage' | 'auth'
  | 'database' | 'realtime' | 'settings' | 'compute'

export interface GuideSequence {
  id: string
  title: string
  feature: GuideFeature
  /** `useIsFeatureEnabled` key; when set and disabled, the engine shows a
   *  "not enabled" notice instead of running. See useGuideFeatureGates. */
  featureGate?: Feature
  steps: GuideStep[]
}

const DOCS = 'https://docs.powabase.ai'
const OVERVIEW = `${DOCS}/concepts/platform-overview`
const A = ONBOARDING_ANCHORS

export const GUIDE_SEQUENCES: Record<string, GuideSequence> = {
  connect: {
    id: 'connect', title: 'Connect your coding agent', feature: 'connect',
    steps: [
      { anchor: A.connect.button, title: 'Connect', placement: 'bottom', docsUrl: `${DOCS}/guides/auth-connection`,
        body: 'Open Connect for everything a coding agent or vibe-coding platform needs — your project URL, API keys, and copy-paste snippets. Use the publishable/anon key in browsers and clients; keep the service_role/secret key on the server only.' },
    ],
  },
  'create-table': {
    id: 'create-table', title: 'Create your first table', feature: 'tables',
    steps: [
      { anchor: A.tables.newTableButton, title: 'New table', placement: 'right', route: '/project/[ref]/editor', docsUrl: OVERVIEW,
        body: 'A table stores structured data, instantly queryable via SQL and the auto-generated REST API. Click New table to start.' },
      { anchor: A.tables.name, title: 'Name it', placement: 'bottom', waitForUserAction: true,
        body: "Give the table a name (e.g. 'profiles') — lowercase, no spaces." },
      { anchor: A.tables.addColumn, title: 'Add columns', placement: 'top', waitForUserAction: true,
        body: 'Each column has a name and a type (text, int8, timestamptz, uuid, jsonb…). Click Add column for each field you need.' },
      { anchor: A.tables.rls, title: 'Row Level Security', placement: 'top', waitForUserAction: true,
        body: 'Toggle RLS to control who can read/write rows (recommended for anything user-facing). When ready, click Save to create the table.' },
    ],
  },
  // add-sources / create-knowledge-base / create-agent / create-orchestration /
  // create-workflow / llm-provider-keys are intentionally left ungated: unlike
  // storage/auth/realtime (which mirror self-hosted Supabase's optional
  // services and have real `project_storage:all` / `project_auth:all` /
  // `realtime:all` toggles), these AI-BaaS features have no equivalent
  // useIsFeatureEnabled key — there's nothing real to gate on, and inventing
  // one would silently misreport as "enabled" (see useGuideFeatureGates.ts).
  // If the anchor genuinely never mounts, useAnchorRect's bounded timeout
  // (ANCHOR_NOT_FOUND_TIMEOUT_MS) auto-skips the step instead.
  'add-sources': {
    id: 'add-sources', title: 'Add sources (docs & websites)', feature: 'sources',
    steps: [
      { anchor: A.sources.newButton, title: 'Add a source', placement: 'bottom', route: '/project/[ref]/sources', docsUrl: OVERVIEW,
        body: "Sources are the raw content you index. Click New Source to add content three ways: Upload files (PDF, Word, Markdown, images — text is extracted, scans OCR'd), Import from Storage, or Import from URL (a page, a whole-site crawl, or a sitemap)." },
      { anchor: A.sources.list, title: 'Track & organize', placement: 'top',
        body: "Each source shows an extraction status — once it reads 'extracted', its text is ready. Next, add sources to a Knowledge Base to index them for retrieval (RAG)." },
    ],
  },
  'create-knowledge-base': {
    id: 'create-knowledge-base', title: 'Create a knowledge base', feature: 'knowledge-bases',
    steps: [
      { anchor: A.knowledgeBases.createButton, title: 'Create a knowledge base', placement: 'bottom', route: '/project/[ref]/knowledge-bases', docsUrl: OVERVIEW,
        body: 'A knowledge base is a searchable index over your sources that powers retrieval (RAG). Click Create to make one.' },
      { anchor: A.knowledgeBases.indexingStrategy, title: 'Pick a strategy', placement: 'bottom', waitForUserAction: true,
        body: 'Choose an indexing strategy: Chunk + embed (default, best for most content), Page index, Full document, or Graph. Retrieval is tunable later.' },
      { anchor: A.knowledgeBases.detailAddSources, title: 'Add sources & index', placement: 'bottom', waitForUserAction: true,
        body: "Open your knowledge base, then Add source to index content. Watch each source move to 'indexed' — then attach the KB to an agent." },
    ],
  },
  'create-agent': {
    id: 'create-agent', title: 'Create an agent', feature: 'agents',
    steps: [
      { anchor: A.agents.createButton, title: 'Create an agent', placement: 'bottom', route: '/project/[ref]/agents', docsUrl: OVERVIEW,
        body: 'An agent is an AI worker with a model, a system prompt, tools, and knowledge. Click Create to make one.' },
      { anchor: A.agents.tabKnowledgeBases, title: 'Attach knowledge', placement: 'bottom', waitForUserAction: true,
        body: 'Open your agent and use the Knowledge Bases tab to attach indexed content so it can answer from your data (RAG).' },
      { anchor: A.agents.tabTools, title: 'Add tools', placement: 'bottom', waitForUserAction: true,
        body: 'In the Tools tab, add capabilities like web search, SQL, or MCP servers.' },
      { anchor: A.agents.save, title: 'Configure & save', placement: 'top', waitForUserAction: true,
        body: 'Set the model and system prompt in Overview — the prompt is the biggest lever on behaviour — then Save. Test it from the agent’s chat.' },
    ],
  },
  'create-orchestration': {
    id: 'create-orchestration', title: 'Create an orchestration', feature: 'orchestrations',
    steps: [
      { anchor: A.orchestrations.createButton, title: 'Create orchestration', placement: 'bottom', route: '/project/[ref]/orchestrations', docsUrl: OVERVIEW,
        body: 'Orchestrations coordinate multiple agents to complete multi-step work. Click Create orchestration, then wire agents together in the builder.' },
    ],
  },
  'create-workflow': {
    id: 'create-workflow', title: 'Create a workflow', feature: 'workflows',
    steps: [
      { anchor: A.workflows.createButton, title: 'Create workflow', placement: 'bottom', route: '/project/[ref]/workflows', docsUrl: OVERVIEW,
        body: 'Workflows chain steps — agents, tools, and logic — into a repeatable pipeline. Click Create workflow, then add blocks on the canvas.' },
    ],
  },
  // sql-query is intentionally left ungated: the SQL Editor runs against
  // Postgres directly and has no service-level enable/disable toggle (there's
  // no `sql:all` equivalent to project_storage:all/project_auth:all/
  // realtime:all — SQL access isn't an optional self-hosted service).
  'sql-query': {
    id: 'sql-query', title: 'Run a SQL query', feature: 'sql',
    steps: [
      { anchor: A.sql.newQuery, title: 'New query', placement: 'bottom', route: '/project/[ref]/sql', docsUrl: OVERVIEW,
        body: 'The SQL Editor runs Postgres against your project. Click New query to open a blank editor.' },
      { anchor: A.sql.run, title: 'Run it', placement: 'bottom', waitForUserAction: true,
        body: 'Write SQL (e.g. select * from your_table) and click Run — or highlight part of it to run just the selection. Results appear below.' },
    ],
  },
  'create-storage-bucket': {
    id: 'create-storage-bucket', title: 'Create a storage bucket', feature: 'storage', featureGate: 'project_storage:all',
    steps: [
      { anchor: A.storage.newBucket, title: 'New bucket', placement: 'bottom', route: '/project/[ref]/storage/files', docsUrl: OVERVIEW,
        body: 'Storage holds files (images, docs, media). Click New bucket to create a container — public or private.' },
      { anchor: A.storage.upload, title: 'Upload files', placement: 'bottom', waitForUserAction: true,
        body: 'Open your bucket, then Upload files. Access is governed by storage RLS policies.' },
    ],
  },
  'add-user': {
    id: 'add-user', title: 'Add a user', feature: 'auth', featureGate: 'project_auth:all',
    steps: [
      { anchor: A.auth.addUser, title: 'Add user', placement: 'bottom', route: '/project/[ref]/auth/users', docsUrl: OVERVIEW,
        body: "Authentication manages your app's end users. Click Add user to invite by email or create one directly." },
    ],
  },
  'create-rls-policy': {
    id: 'create-rls-policy', title: 'Create an RLS policy', feature: 'auth', featureGate: 'project_auth:all',
    steps: [
      { anchor: A.auth.newPolicy, title: 'Create policy', placement: 'bottom', route: '/project/[ref]/auth/policies', docsUrl: OVERVIEW,
        body: 'Row Level Security policies decide who can read or write each row. Open the table you want to protect and click Create policy to add a rule (e.g. users see only their own rows). No tables yet? Create one first.' },
    ],
  },
  // schema-visualizer / database-functions / database-triggers /
  // database-indexes / enable-extension are intentionally left ungated (unlike
  // database-roles below, which gates on the real `database:roles` key): they're
  // core Postgres DDL/introspection, always available, with no service-level
  // toggle to check — `database:roles` covers the RBAC-specific roles UI only,
  // not database access itself.
  'schema-visualizer': {
    id: 'schema-visualizer', title: 'Explore your schema', feature: 'database',
    steps: [
      { anchor: A.database.schemaVisualizer, title: 'Schema Visualizer', placement: 'bottom', route: '/project/[ref]/database/schemas', docsUrl: OVERVIEW,
        body: 'The Schema Visualizer maps your tables and their relationships. Use the schema selector to switch schemas and see how your data connects.' },
    ],
  },
  'database-functions': {
    id: 'database-functions', title: 'Create a database function', feature: 'database',
    steps: [
      { anchor: A.database.newFunction, title: 'New function', placement: 'bottom', route: '/project/[ref]/database/functions', docsUrl: OVERVIEW,
        body: 'Database functions run custom logic in Postgres (PL/pgSQL). Click Create a new function — callable from SQL or triggers.' },
    ],
  },
  'database-triggers': {
    id: 'database-triggers', title: 'Create a trigger', feature: 'database',
    steps: [
      { anchor: A.database.newTrigger, title: 'New trigger', placement: 'bottom', route: '/project/[ref]/database/triggers', docsUrl: OVERVIEW,
        body: 'Triggers run a function automatically on insert/update/delete. Click New trigger to attach one to a table.' },
    ],
  },
  'database-indexes': {
    id: 'database-indexes', title: 'Create an index', feature: 'database',
    steps: [
      { anchor: A.database.createIndex, title: 'Create index', placement: 'bottom', route: '/project/[ref]/database/indexes', docsUrl: OVERVIEW,
        body: 'Indexes speed up queries on large tables. Click Create index and pick the column(s) your queries filter or sort on.' },
    ],
  },
  'database-roles': {
    id: 'database-roles', title: 'Add a database role', feature: 'database', featureGate: 'database:roles',
    steps: [
      { anchor: A.database.addRole, title: 'Add role', placement: 'bottom', route: '/project/[ref]/database/roles', docsUrl: OVERVIEW,
        body: 'Roles group database permissions. Click Add role to create one and grant it scoped access.' },
    ],
  },
  // enable-extension: same rationale as schema-visualizer/database-* above —
  // no service-level toggle exists for Postgres extensions.
  'enable-extension': {
    id: 'enable-extension', title: 'Enable a Postgres extension', feature: 'database',
    steps: [
      { anchor: A.database.extensions, title: 'Find an extension', placement: 'bottom', route: '/project/[ref]/database/extensions', docsUrl: OVERVIEW,
        body: 'Extensions add capabilities (pgvector for embeddings, postgis for geo, and more). Search for one, then toggle it on.' },
    ],
  },
  'auth-providers': {
    id: 'auth-providers', title: 'Configure sign-in providers', feature: 'auth', featureGate: 'project_auth:all',
    steps: [
      { anchor: A.auth.providers, title: 'Sign-in providers', placement: 'bottom', route: '/project/[ref]/auth/providers', docsUrl: OVERVIEW,
        body: 'Providers let users sign in with email, OAuth (Google, GitHub…), and more. Click a provider to configure and enable it.' },
    ],
  },
  'realtime-inspector': {
    id: 'realtime-inspector', title: 'Inspect realtime events', feature: 'realtime', featureGate: 'realtime:all',
    steps: [
      { anchor: A.realtime.inspector, title: 'Start listening', placement: 'bottom', route: '/project/[ref]/realtime/inspector', docsUrl: OVERVIEW,
        body: 'Realtime broadcasts database changes and messages to clients over websockets. Join a channel and click Start listening to watch events live.' },
    ],
  },
  'llm-provider-keys': {
    id: 'llm-provider-keys', title: 'Add an LLM provider key', feature: 'settings',
    steps: [
      { anchor: A.settings.llmKeys, title: 'Add Key', placement: 'bottom', route: '/project/[ref]/settings/llm-keys', docsUrl: OVERVIEW,
        body: 'Powabase is BYOK — bring your own LLM keys. Click Add Key to store an Anthropic / OpenAI / etc. key your agents and copilots use.' },
    ],
  },
  'manage-compute': {
    id: 'manage-compute', title: 'Manage compute', feature: 'compute',
    steps: [
      { anchor: A.compute.tiers, title: 'Compute size', placement: 'bottom', route: '/project/[ref]/infrastructure', docsUrl: OVERVIEW,
        body: "Each tier sizes this project's isolated Postgres + AI runtime — CPU, RAM, disk, object storage, egress, and monthly active users — billed per hour against your organization's credits. Your current tier is shown here." },
      { anchor: A.compute.resize, title: 'Resize', placement: 'top', waitForUserAction: true,
        body: 'Pick a higher tier for more throughput on production or multi-agent workloads, then click Resize. Applying briefly restarts the database (~1–3 min) while connections reconnect.' },
    ],
  },
}

export const GUIDE_SEQUENCE_IDS = Object.keys(GUIDE_SEQUENCES)

export const getSequence = (id: string): GuideSequence | undefined => GUIDE_SEQUENCES[id]
