/**
 * Declarative block config registry.
 *
 * Each block type declares its UI fields as a SubBlockConfig[] array.
 * A single renderer maps sub-block types to React components.
 */

// ─── Input mapping type ──────────────────────────────────────────────────────

export interface InputMapping {
  sourceId: string;
  outputField: string;
  targetField: string;
}

// ─── Sub-block types ────────────────────────────────────────────────────────

export type SubBlockType =
  | "short-input"
  | "long-input"
  | "dropdown"
  | "code"
  | "switch"
  | "agent-select"
  | "kb-select"
  | "slider"
  | "table"
  | "combobox"
  | "json-kv"
  | "checkbox-group"
  | "model-selector";

export interface SubBlockCondition {
  field: string;
  value: unknown | unknown[];  // array = OR match
  not?: boolean;               // negate
  and?: SubBlockCondition;     // chain AND
}

export interface SubBlockConfig {
  id: string;
  title: string;
  type: SubBlockType;
  placeholder?: string;
  defaultValue?: unknown;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  rows?: number;
  language?: string;
  condition?: SubBlockCondition;
  noAutoMap?: boolean;
  description?: string;
  example?: string;
  helpSections?: Array<{
    title: string;
    body: string;
    format?: "text" | "code" | "pills";
  }>;
  copilotHint?: string;
  mode?: "basic" | "advanced";
  min?: number;
  max?: number;
  step?: number;
  columns?: string[];
  checkboxItems?: Array<{
    key: string;
    label: string;
    alias?: string;
    tag?: string;
  }>;
}

// ─── Shared constants ──────────────────────────────────────────────────────

export const MODEL_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "GPT-5.4 Mini", value: "gpt-5.4-mini" },
  { label: "GPT-5.4", value: "gpt-5.4" },
  { label: "GPT-4.1 Mini", value: "gpt-4.1-mini" },
  { label: "Claude Sonnet 4.6", value: "claude-sonnet-4-6" },
  { label: "Claude Opus 4.6", value: "claude-opus-4-6" },
  { label: "Claude Haiku 4.5", value: "claude-haiku-4-5" },
  { label: "Gemini 2.5 Flash", value: "gemini/gemini-2.5-flash" },
  { label: "Gemini 2.5 Pro", value: "gemini/gemini-2.5-pro" },
  { label: "DeepSeek V3", value: "deepseek-chat" },
  { label: "DeepSeek R1", value: "deepseek-reasoner" },
];

// ─── Copilot metadata ──────────────────────────────────────────────────────

export interface CopilotBlockMetadata {
  whenToUse: string;
  useCases: string[];
  constraints: string[];
  outputShape: Record<string, string>;
  connectionPatterns: {
    upstream?: Array<{ type: string; reason: string }>;
    downstream?: Array<{ type: string; reason: string }>;
  };
  exampleSnippets: Array<{
    description: string;
    blocks: Array<{ id: string; type: string; config: Record<string, unknown> }>;
    edges: Array<{ source: string; target: string; sourceHandle?: string }>;
  }>;
}

export interface OutputConfig {
  type: "string" | "number" | "boolean" | "json" | "any";
  description?: string;
}

export interface BlockTypeConfig {
  type: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  subBlocks: SubBlockConfig[];
  hasInput: boolean;
  hasOutput: boolean;
  outputs: Record<string, OutputConfig>;
  outputHandles?: string[];
  docs?: {
    input?: string;
    output?: string;
  };
  copilot?: CopilotBlockMetadata;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const blockRegistry: Record<string, BlockTypeConfig> = {
  // ─── Trigger & Response ──────────────────────────────────────────────────

  starter: {
    type: "starter",
    name: "Starter",
    description: "Entry point — passes input variables through",
    icon: "Play",
    color: "emerald",
    outputs: {}, // dynamic — computed from config
    docs: {
      output:
        'Outputs a JSON object with the defined variables. Reference as <starter_1.output> or <starter_1.output.key>.',
    },
    copilot: {
      whenToUse: "Entry point for Run panel or API-triggered workflows. Use this to define input variables that the caller provides when invoking the workflow. Every workflow needs exactly one trigger block — use starter for manual/API invocations.",
      useCases: [
        "Accept a user query for an agent-based Q&A workflow",
        "Define structured parameters for a data processing pipeline",
        "Set up a scheduled periodic job with input defaults",
      ],
      constraints: [
        "Exactly one trigger block (starter or webhook) per workflow.",
        "The `input` json-kv keys define both the workflow's input parameters AND the output shape of this block.",
        "Schedule fields (schedule_enabled, schedule_type, etc.) only matter when the workflow is deployed — they are ignored during manual runs.",
      ],
      outputShape: { output: "JSON object with keys matching the defined input variables" },
      connectionPatterns: {
        downstream: [
          { type: "agent", reason: "Pass user input to an LLM for processing" },
          { type: "code", reason: "Transform or validate input data" },
          { type: "condition", reason: "Route based on input values" },
          { type: "platform_api", reason: "Use input to query platform resources" },
          { type: "general_api", reason: "Use input in external API calls" },
        ],
      },
      exampleSnippets: [
        {
          description: "Simple Q&A: accept a query, send to agent, return response",
          blocks: [
            { id: "starter_1", type: "starter", config: { input: { query: "string", limit: "number" } } },
            { id: "agent_1", type: "agent", config: { input: "Summarize: <starter_1.output.query>" } },
            { id: "response_1", type: "response", config: { output: "<agent_1.output>" } },
          ],
          edges: [
            { source: "starter_1", target: "agent_1" },
            { source: "agent_1", target: "response_1" },
          ],
        },
      ],
    },
    subBlocks: [
      {
        id: "input",
        title: "Input Variables",
        type: "json-kv",
        placeholder: "variable name",
        description:
          "Define input variables as key-value pairs. Keys become input fields in the Run panel.",
        copilotHint: "Keys defined here become the workflow's input parameters AND output fields. Reference as `<starter_1.output.keyName>`.",
      },
      {
        id: "schedule_enabled",
        title: "Enable Schedule",
        type: "switch",
        defaultValue: false,
        description: "Run this workflow on a schedule when deployed.",
      },
      {
        id: "schedule_type",
        title: "Schedule Type",
        type: "dropdown",
        defaultValue: "interval",
        options: [
          { label: "Interval", value: "interval" },
          { label: "Cron Expression", value: "cron" },
        ],
        condition: { field: "schedule_enabled", value: true },
      },
      {
        id: "schedule_interval_value",
        title: "Every",
        type: "short-input",
        placeholder: "5",
        condition: { field: "schedule_enabled", value: true, and: { field: "schedule_type", value: "interval" } },
      },
      {
        id: "schedule_interval_unit",
        title: "Unit",
        type: "dropdown",
        defaultValue: "minutes",
        options: [
          { label: "Minutes", value: "minutes" },
          { label: "Hours", value: "hours" },
          { label: "Days", value: "days" },
        ],
        condition: { field: "schedule_enabled", value: true, and: { field: "schedule_type", value: "interval" } },
      },
      {
        id: "schedule_cron",
        title: "Cron Expression",
        type: "short-input",
        placeholder: "0 9 * * *",
        condition: { field: "schedule_enabled", value: true, and: { field: "schedule_type", value: "cron" } },
        description: "Standard 5-field cron (min hour dom month dow).",
      },
      {
        id: "schedule_timezone",
        title: "Timezone",
        type: "dropdown",
        defaultValue: "UTC",
        options: [
          { label: "UTC", value: "UTC" },
          { label: "US/Eastern", value: "US/Eastern" },
          { label: "US/Central", value: "US/Central" },
          { label: "US/Pacific", value: "US/Pacific" },
          { label: "Europe/London", value: "Europe/London" },
          { label: "Europe/Berlin", value: "Europe/Berlin" },
          { label: "Asia/Tokyo", value: "Asia/Tokyo" },
          { label: "Asia/Shanghai", value: "Asia/Shanghai" },
        ],
        condition: { field: "schedule_enabled", value: true },
      },
      {
        id: "schedule_start_at",
        title: "Start At",
        type: "short-input",
        placeholder: "2026-01-01T00:00 (optional)",
        condition: { field: "schedule_enabled", value: true },
        description: "ISO 8601 datetime. Leave blank to start immediately on deploy.",
      },
      {
        id: "schedule_end_at",
        title: "End At",
        type: "short-input",
        placeholder: "Optional",
        condition: { field: "schedule_enabled", value: true },
        description: "ISO 8601 datetime. Leave blank for indefinite.",
      },
      {
        id: "schedule_max_runs",
        title: "Max Runs",
        type: "short-input",
        placeholder: "Unlimited",
        condition: { field: "schedule_enabled", value: true },
        description: "Maximum scheduled executions. Leave blank for unlimited.",
      },
    ],
    hasInput: false,
    hasOutput: true,
  },

  webhook: {
    type: "webhook",
    name: "Webhook",
    description: "Trigger workflow via external HTTP POST",
    icon: "Webhook",
    color: "sky",
    outputs: { output: { type: "json", description: "Webhook payload" } },
    docs: {
      output:
        "Outputs the full JSON body sent to the webhook URL. Reference as <webhook_1.output> or <webhook_1.output.field>.",
    },
    copilot: {
      whenToUse: "Entry point for externally-triggered workflows via HTTP POST. Use when the workflow should be invoked by an external system (e.g., a third-party service, CI/CD pipeline, or another application) sending a POST request to a generated URL.",
      useCases: [
        "Receive events from third-party services (Stripe webhooks, GitHub events, etc.)",
        "Accept form submissions or data pushes from external applications",
        "Trigger workflows from CI/CD pipelines or automation tools",
      ],
      constraints: [
        "URL and secret are auto-generated — do not configure them manually.",
        "Output is the raw POST body as JSON.",
        "Exactly one trigger block (starter or webhook) per workflow.",
        "The copilot should ask the user what JSON shape to expect from the webhook caller before building downstream blocks that reference specific fields. Do not guess the payload structure.",
      ],
      outputShape: { output: "Full JSON body from incoming POST — shape depends on the external caller. Ask the user to describe the expected payload." },
      connectionPatterns: {
        downstream: [
          { type: "agent", reason: "Process webhook payload with an LLM" },
          { type: "code", reason: "Parse or transform the incoming payload" },
          { type: "condition", reason: "Route based on payload content" },
        ],
      },
      exampleSnippets: [],
    },
    subBlocks: [
      {
        id: "webhook_url",
        title: "Webhook URL",
        type: "short-input",
        placeholder: "Save workflow to generate URL",
        noAutoMap: true,
      },
      {
        id: "webhook_secret",
        title: "Secret Token",
        type: "short-input",
        placeholder: "Auto-generated",
        noAutoMap: true,
      },
    ],
    hasInput: false,
    hasOutput: true,
  },

  response: {
    type: "response",
    name: "Response",
    description: "Terminal output node",
    icon: "MessageSquare",
    color: "rose",
    outputs: {},
    docs: {
      input: "Receives the final value to return from the workflow.",
    },
    copilot: {
      whenToUse: "Terminal block to return data to the caller. Required for API or webhook workflows that need to send a return value. Place at the end of the workflow with no outgoing edges.",
      useCases: [
        "Return an agent's answer to the API caller",
        "Send processed data back to a webhook initiator",
        "Combine multiple upstream outputs into a single response",
      ],
      constraints: [
        "Must be the last block — no outgoing edges allowed.",
        "The output field should reference upstream blocks using <blockId.output> syntax.",
        "This block has no output itself — it is a terminal.",
      ],
      outputShape: {},
      connectionPatterns: {
        upstream: [
          { type: "agent", reason: "Return LLM-generated response" },
          { type: "code", reason: "Return transformed/computed data" },
          { type: "platform_api", reason: "Return platform API results" },
          { type: "general_api", reason: "Return external API results" },
        ],
      },
      exampleSnippets: [],
    },
    subBlocks: [
      {
        id: "output",
        title: "Output",
        type: "long-input",
        rows: 3,
        required: true,
        placeholder: "<agent1.output>",
        description:
          "The final output of the workflow. Use a block reference to pass through another block's result.",
        copilotHint: "Use a block reference like `<agent_1.output>` to pass through an upstream block's result. Can also template multiple references together.",
        example:
          "<agent_1.output>\n\n// Or combine multiple outputs:\nName: <starter_1.output.name>\nResult: <function_1.output>",
      },
      {
        id: "status",
        title: "Status Code",
        type: "short-input",
        placeholder: "200",
        defaultValue: "200",
        description: "HTTP status code to return",
      },
      {
        id: "headers",
        title: "Response Headers",
        type: "table",
        columns: ["Key", "Value"],
        mode: "advanced",
        description: "Response headers as key-value pairs",
      },
    ],
    hasInput: true,
    hasOutput: false,
  },

  // ─── Control Flow ────────────────────────────────────────────────────────

  condition: {
    type: "condition",
    name: "Condition",
    description: "Branch with if/else-if/else expressions",
    icon: "GitBranch",
    color: "orange",
    outputs: { route: { type: "string", description: "Selected route" } },
    docs: {
      input: "Receives output from connected blocks.",
      output:
        'Evaluates branches top-to-bottom. First truthy expression wins. Falls through to "else" if none match.',
    },
    copilot: {
      whenToUse: "Branch execution based on boolean expressions. Evaluates conditions top-to-bottom; the first truthy expression wins, with an else fallback. Use when the workflow needs to take different paths depending on data values.",
      useCases: [
        "Route urgent vs. normal requests to different agents",
        "Check API response status before proceeding",
        "Filter data based on field values",
      ],
      constraints: [
        "Branches are configured via `config.branches` array (not sub-blocks). Each branch has an `expression` string.",
        "Edges must set sourceHandle to 'if', 'elif_1', 'elif_2', etc., or 'else'.",
        "Expressions support `==`, `!=`, `<`, `>`, `and`, `or`, `not` but NO function calls (no `len()`, `str()`, etc.).",
        "References in expressions (e.g., `<starter_1.output.type>`) are resolved at runtime.",
      ],
      outputShape: { route: "'if' | 'elif_N' | 'else' — indicates which branch was taken" },
      connectionPatterns: {
        upstream: [
          { type: "starter", reason: "Branch based on input values" },
          { type: "agent", reason: "Branch based on LLM output" },
          { type: "code", reason: "Branch based on computed values" },
        ],
        downstream: [
          { type: "agent", reason: "Different agents for different branches" },
          { type: "code", reason: "Different processing per branch" },
          { type: "general_api", reason: "Different API calls per branch" },
        ],
      },
      exampleSnippets: [
        {
          description: "Route urgent vs. normal requests to different agents",
          blocks: [
            { id: "starter_1", type: "starter", config: { input: { message: "string", type: "string" } } },
            { id: "condition_1", type: "condition", config: { branches: [{ expression: "<starter_1.output.type> == 'urgent'" }] } },
            { id: "agent_1", type: "agent", config: { input: "URGENT: <starter_1.output.message>" } },
            { id: "agent_2", type: "agent", config: { input: "<starter_1.output.message>" } },
          ],
          edges: [
            { source: "starter_1", target: "condition_1" },
            { source: "condition_1", target: "agent_1", sourceHandle: "if" },
            { source: "condition_1", target: "agent_2", sourceHandle: "else" },
          ],
        },
      ],
    },
    subBlocks: [],
    hasInput: true,
    hasOutput: true,
    outputHandles: ["if", "else"], // minimum default; dynamic handles computed in BlockNode
  },

  split: {
    type: "split",
    name: "Split",
    description: "Forward input to multiple parallel branches",
    icon: "Split",
    color: "teal",
    outputs: { output: { type: "any", description: "Pass-through data" } },
    docs: {
      input: "Receives data from a connected upstream block.",
      output:
        "Forwards the same data to all connected branches. Reference as <split_1.output>.",
    },
    copilot: {
      whenToUse: "Fan out data to multiple parallel branches. All downstream blocks receive the same input simultaneously. Use when you need to process the same data in multiple independent ways at once.",
      useCases: [
        "Send the same query to multiple agents for comparison",
        "Simultaneously call multiple external APIs with the same data",
        "Fork processing into parallel pipelines that later merge",
      ],
      constraints: [
        "Pass-through only — no data transformation occurs.",
        "Config `branches` (number) sets how many output handles are available.",
      ],
      outputShape: { output: "Same data as input, forwarded unchanged" },
      connectionPatterns: {
        upstream: [
          { type: "starter", reason: "Fan out initial input" },
          { type: "code", reason: "Fan out processed data" },
          { type: "agent", reason: "Fan out LLM output" },
        ],
        downstream: [
          { type: "agent", reason: "Parallel LLM processing" },
          { type: "code", reason: "Parallel data transformation" },
          { type: "general_api", reason: "Parallel external API calls" },
        ],
      },
      exampleSnippets: [],
    },
    subBlocks: [
      {
        id: "input",
        title: "Input",
        type: "long-input",
        rows: 2,
        placeholder: "Data from connected blocks (auto-populated)",
        description: "Input data forwarded to all branches.",
      },
    ],
    hasInput: true,
    hasOutput: true,
  },

  // ─── Action ──────────────────────────────────────────────────────────────

  agent: {
    type: "agent",
    name: "Agent",
    description: "Execute an LLM call",
    icon: "Bot",
    color: "violet",
    outputs: { output: { type: "string", description: "LLM response" } },
    docs: {
      input:
        "Receives data from connected blocks via variable references in the prompt.",
      output: "Outputs the LLM response text. Reference as <agent_1.output>.",
    },
    copilot: {
      whenToUse: "Call an LLM via a pre-configured agent for generation, summarization, classification, or Q&A. Supports RAG via knowledge bases. Can use an existing agent from the project or be configured inline with model/prompt fields.",
      useCases: [
        "Summarize or analyze text from upstream blocks",
        "Classify input data into categories",
        "Answer user questions with optional RAG from knowledge bases",
        "Generate structured output (JSON, lists) from unstructured input",
      ],
      constraints: [
        "Either select an existing `agent_id` OR configure inline — the copilot should judge which is more appropriate.",
        "If a suitable agent already exists, prefer referencing it. If the task is one-off or specialized, inline config is fine.",
        "The `input` field is the user message / prompt context — use `<ref>` syntax to inject upstream data.",
        "Knowledge bases: for inline agents, attach KBs in the block config. For existing agents (agent_id), the agent's own KB attachments are used automatically — do NOT set knowledge_bases in the block.",
      ],
      outputShape: { output: "LLM response text (string)" },
      connectionPatterns: {
        upstream: [
          { type: "starter", reason: "Receive user input to process" },
          { type: "code", reason: "Receive transformed data" },
          { type: "platform_api", reason: "Receive platform data to reason about" },
        ],
        downstream: [
          { type: "code", reason: "Post-process or parse LLM output" },
          { type: "response", reason: "Return LLM output as workflow result" },
          { type: "condition", reason: "Branch based on LLM output" },
        ],
      },
      exampleSnippets: [
        {
          description: "Starter → Agent (summarize) → Response",
          blocks: [
            { id: "starter_1", type: "starter", config: { input: { text: "string" } } },
            { id: "agent_1", type: "agent", config: { input: "Summarize: <starter_1.output.text>" } },
            { id: "response_1", type: "response", config: { output: "<agent_1.output>" } },
          ],
          edges: [
            { source: "starter_1", target: "agent_1" },
            { source: "agent_1", target: "response_1" },
          ],
        },
      ],
    },
    subBlocks: [
      {
        id: "agent_id",
        title: "Agent",
        type: "agent-select",
        description: "Select a pre-configured agent.",
        copilotHint: "Select an existing agent from the project, or leave blank to configure model/prompt inline. Prefer existing agents when a suitable one exists; use inline config for one-off or specialized tasks.",
      },
      {
        id: "input",
        title: "Input",
        type: "long-input",
        rows: 3,
        placeholder: "Data from connected blocks (auto-populated)",
        description: "Input data passed to the agent. Use <blockId.output> to reference upstream blocks.",
        copilotHint: "The message/prompt sent to the agent. Use `<blockId.output>` references to inject upstream data as context.",
      },
      {
        id: "model",
        title: "Model",
        type: "model-selector",
        defaultValue: "gpt-5.4-mini",
        placeholder: "Select a model...",
        options: MODEL_OPTIONS,
        condition: { field: "agent_id", value: "" },
        description: "The LLM model to use for this agent call.",
        copilotHint: "The LLM model to use. Only set when configuring inline (no agent_id). Defaults to gpt-5.4-mini.",
      },
      {
        id: "system_prompt",
        title: "System Prompt",
        type: "long-input",
        rows: 8,
        placeholder: "You are a helpful assistant...",
        condition: { field: "agent_id", value: "" },
        description: "Instructions that define the agent's behavior. Sent as the system message to the LLM.",
        copilotHint: "Define the agent's role, persona, and constraints. Only relevant for inline config (no agent_id). When using agent_id, the agent's own system prompt is used.",
      },
      {
        id: "knowledge_bases",
        title: "Knowledge Bases",
        type: "kb-select",
        description:
          "Attach knowledge bases for RAG. Relevant chunks are injected into context automatically.",
        condition: { field: "agent_id", value: "" },
        copilotHint: "Only for inline agent blocks (no agent_id). When using an existing agent, the agent's own KB attachments are used automatically.",
      },
      {
        id: "temperature",
        title: "Temperature",
        type: "slider",
        min: 0,
        max: 2,
        step: 0.1,
        defaultValue: 0.7,
        mode: "advanced",
        condition: { field: "agent_id", value: "" },
        copilotHint: "Controls randomness (0 = deterministic, 2 = very creative). Only relevant for inline config. Default 0.7.",
      },
      {
        id: "max_tokens",
        title: "Max Tokens",
        type: "short-input",
        placeholder: "4096",
        mode: "advanced",
        condition: { field: "agent_id", value: "" },
        copilotHint: "Maximum response length. Only relevant for inline config. Leave blank for model default.",
      },
    ],
    hasInput: true,
    hasOutput: true,
  },

  code: {
    type: "code",
    name: "Code",
    description: "Execute sandboxed Python code",
    icon: "Code",
    color: "amber",
    outputs: { output: { type: "json", description: "Return value" } },
    docs: {
      input:
        "Upstream block outputs available as `input_data` dict (e.g., `input_data[\"agent_1\"][\"output\"]`). Also available as individual variables (e.g., block `agent-1` → `agent_1`). Write `import` statements directly in the code.",
      output:
        "Assign to `output` variable. Downstream blocks reference it as <function_1.output>.",
    },
    copilot: {
      whenToUse: "Run Python code for data transformation, parsing, computation, or any logic that other blocks can't express. Use whenever you need programmatic control beyond what agent prompts or API calls provide.",
      useCases: [
        "Parse and restructure JSON data between blocks",
        "Perform calculations, aggregations, or filtering",
        "Format data for downstream API calls or agent prompts",
        "Implement custom business logic",
      ],
      constraints: [
        "MUST assign the result to the `output` variable — this is the only way to pass data downstream.",
        "Upstream outputs are available as `input_data` dict and as individual variables (hyphens converted to underscores).",
        "Write `import` statements directly in the code (e.g. `import pandas as pd`). Pre-installed packages load instantly; unknown packages are pip-installed at runtime.",
        "Only safe builtins are available (abs, all, any, bool, dict, enumerate, filter, float, int, isinstance, len, list, map, max, min, print, range, round, set, sorted, str, sum, tuple, type, zip).",
      ],
      outputShape: { output: "Whatever is assigned to the `output` variable (typically dict/JSON)" },
      connectionPatterns: {
        upstream: [
          { type: "starter", reason: "Transform raw input data" },
          { type: "agent", reason: "Parse or post-process LLM output" },
          { type: "platform_api", reason: "Process platform API responses" },
          { type: "general_api", reason: "Process external API responses" },
        ],
        downstream: [
          { type: "agent", reason: "Feed transformed data to LLM" },
          { type: "response", reason: "Return computed result" },
          { type: "condition", reason: "Branch on computed values" },
          { type: "general_api", reason: "Use computed data in API calls" },
        ],
      },
      exampleSnippets: [],
    },
    subBlocks: [
      {
        id: "language",
        title: "Language",
        type: "dropdown",
        defaultValue: "python",
        options: [{ label: "Python", value: "python" }],
      },
      {
        id: "code",
        title: "Code",
        type: "code",
        language: "python",
        rows: 18,
        noAutoMap: true,
        placeholder: "import json\nimport pandas as pd\n\n# input_data = upstream block outputs dict\n# also available as individual variables\ndata = input_data[\"agent_1\"][\"output\"]\n\noutput = data",
        description:
          "Write Python code to transform data. Import packages directly in the code. Assign result to output.",
        copilotHint: "MUST assign result to the `output` variable. Write `import` statements directly in the code. Access upstream data via `input_data['block_id']['output']` or as `block_id_N['output']`.",
        helpSections: [
          {
            title: "Accessing Upstream Data",
            body: '# As individual variables (hyphens become underscores)\nresult = agent_1["output"]\nroute = condition_2["route"]\n\n# Via input_data dict (all upstream outputs)\nresult = input_data["agent_1"]["output"]',
            format: "code",
          },
          {
            title: "Available Builtins",
            body: "abs, all, any, bool, dict, enumerate, filter, float, int, isinstance, len, list, map, max, min, print, range, round, set, sorted, str, sum, tuple, type, zip",
            format: "pills",
          },
          {
            title: "Pre-installed Packages",
            body: "Standard Library: json, re, math, datetime, collections, itertools, functools, hashlib, base64, urllib, csv, io, string, textwrap, uuid, copy, operator\n\nData Science: numpy (as np), pandas (as pd), scipy, scikit-learn (import sklearn), matplotlib, seaborn (as sns)\n\nNetwork / HTTP: requests, httpx\n\nText / NLP: tiktoken, beautifulsoup4 (import bs4), pyyaml (import yaml)\n\nOther: Pillow (import PIL), python-dateutil (import dateutil), pydantic\n\nCustom: Any pip package can be imported — if not pre-installed, it will be pip-installed at runtime (e.g. import openai)",
            format: "text",
          },
          {
            title: "Example",
            body: 'import json\nimport pandas as pd\n\n# Access upstream data\ndata = agent_1["output"]\n\n# Create DataFrame and analyze\ndf = pd.DataFrame(data)\nsummary = df.describe().to_dict()\n\noutput = {"summary": json.dumps(summary)}',
            format: "code",
          },
        ],
      },
    ],
    hasInput: true,
    hasOutput: true,
  },

  platform_api: {
    type: "platform_api",
    name: "Platform API",
    description: "Call internal platform services",
    icon: "Layers",
    color: "indigo",
    outputs: { output: { type: "json", description: "API response data" } },
    docs: {
      input:
        "Use block references in Resource ID or Body to pass dynamic values.",
      output:
        "Outputs the JSON response from the platform API. Reference as <platform_api_1.output>.",
    },
    copilot: {
      whenToUse: "Call internal platform services (agents, knowledge bases, sources, sessions, context handlers, database). Prefer this over general_api for any Agentic Platform interaction.",
      useCases: [
        "Search a knowledge base for relevant context before sending to an agent",
        "Create or update platform resources (agents, KBs) dynamically",
        "Query the project database for user data",
        "Run an existing agent with a message and optional RAG",
      ],
      constraints: [
        "`resource` determines which sub-fields are relevant.",
        "`resource_id` is required for get/update/delete/run/search, blank for list/create.",
        "`use_raw_json` and form fields are mutually exclusive — use one or the other.",
      ],
      outputShape: { output: "JSON response from the platform API endpoint" },
      connectionPatterns: {
        upstream: [
          { type: "starter", reason: "Use input values for API calls" },
          { type: "code", reason: "Use computed values in API parameters" },
        ],
        downstream: [
          { type: "agent", reason: "Feed platform data to LLM" },
          { type: "code", reason: "Process API response" },
          { type: "response", reason: "Return API result" },
        ],
      },
      exampleSnippets: [
        {
          description: "Search knowledge base then feed results to agent",
          blocks: [
            { id: "starter_1", type: "starter", config: { input: { question: "string" } } },
            { id: "platform_api_1", type: "platform_api", config: { resource: "knowledge_bases", kb_operation: "search", resource_id: "kb-uuid", kb_search_query: "<starter_1.output.question>" } },
            { id: "agent_1", type: "agent", config: { input: "Using this context: <platform_api_1.output>\n\nAnswer: <starter_1.output.question>" } },
            { id: "response_1", type: "response", config: { output: "<agent_1.output>" } },
          ],
          edges: [
            { source: "starter_1", target: "platform_api_1" },
            { source: "platform_api_1", target: "agent_1" },
            { source: "agent_1", target: "response_1" },
          ],
        },
      ],
    },
    subBlocks: [
      {
        id: "resource",
        title: "Resource",
        type: "dropdown",
        required: true,
        copilotHint: "Determines which operation and form fields are available. Each resource has different CRUD operations.",
        options: [
          { label: "Agents", value: "agents" },
          { label: "Knowledge Bases", value: "knowledge_bases" },
          { label: "Sources", value: "sources" },
          { label: "Sessions", value: "sessions" },
          { label: "Context Handlers", value: "context_handlers" },
          { label: "Database", value: "database" },
        ],
      },
      {
        id: "agents_operation",
        title: "Operation",
        type: "dropdown",
        condition: { field: "resource", value: "agents" },
        options: [
          { label: "List", value: "list" },
          { label: "Get", value: "get" },
          { label: "Run", value: "run" },
          { label: "Create", value: "create" },
          { label: "Update", value: "update" },
          { label: "Delete", value: "delete" },
        ],
      },
      {
        id: "kb_operation",
        title: "Operation",
        type: "dropdown",
        condition: { field: "resource", value: "knowledge_bases" },
        options: [
          { label: "List", value: "list" },
          { label: "Get", value: "get" },
          { label: "Search", value: "search" },
          { label: "Create", value: "create" },
          { label: "Update", value: "update" },
          { label: "Delete", value: "delete" },
        ],
      },
      {
        id: "sources_operation",
        title: "Operation",
        type: "dropdown",
        condition: { field: "resource", value: "sources" },
        options: [
          { label: "List", value: "list" },
          { label: "Get", value: "get" },
          { label: "Delete", value: "delete" },
        ],
      },
      {
        id: "sessions_operation",
        title: "Operation",
        type: "dropdown",
        condition: { field: "resource", value: "sessions" },
        options: [
          { label: "Get", value: "get" },
          { label: "List Messages", value: "list_messages" },
          { label: "Delete", value: "delete" },
        ],
      },
      {
        id: "ch_operation",
        title: "Operation",
        type: "dropdown",
        condition: { field: "resource", value: "context_handlers" },
        options: [
          { label: "List", value: "list" },
          { label: "Get", value: "get" },
          { label: "Create", value: "create" },
        ],
      },
      {
        id: "db_operation",
        title: "Operation",
        type: "dropdown",
        condition: { field: "resource", value: "database" },
        options: [
          { label: "List Tables", value: "list_tables" },
          { label: "List Rows", value: "list" },
          { label: "Get Row", value: "get" },
          { label: "Create Row", value: "create" },
          { label: "Update Row", value: "update" },
          { label: "Delete Row", value: "delete" },
        ],
      },
      {
        id: "resource_id",
        title: "Resource ID",
        type: "short-input",
        placeholder: "UUID or block reference",
        description:
          "ID of the resource (for get/update/delete/run/search). Leave blank for list/create.",
        copilotHint: "Required for get/update/delete/run/search. Leave blank for list/create.",
        helpSections: [
          {
            title: "",
            body: "The UUID of the resource to operate on. Required for Get, Update, Delete, Run, and Search operations. Leave blank for List and Create — List returns all resources, Create generates a new UUID automatically.",
            format: "text",
          },
          {
            title: "Example",
            body: '# Hardcoded UUID\na1b2c3d4-5678-90ab-cdef-1234567890ab\n\n# Reference from an upstream block\n<agent_1.output.id>\n<knowledge_base_1.output.id>',
            format: "code",
          },
        ],
      },

      // ── Raw JSON toggle ──────────────────────────────────────────────
      {
        id: "use_raw_json",
        title: "Raw JSON Mode",
        type: "switch",
        defaultValue: false,
        description: "Toggle to edit the request body as raw JSON instead of form fields.",
        condition: {
          field: "resource",
          value: ["agents", "knowledge_bases", "context_handlers", "database"],
        },
      },

      // ── Raw JSON body (visible only when toggle is on) ───────────────
      {
        id: "body",
        title: "Parameters",
        type: "code",
        language: "json",
        rows: 4,
        placeholder: '{"message": "Hello"}',
        description:
          "Request body as JSON. Required for create/update/run/search/query operations.",
        helpSections: [
          {
            title: "",
            body: "The full request body as raw JSON. Required for Create, Update, Run, and Search operations. The shape depends on the selected resource and operation — see the individual field help icons for each operation's expected keys, or toggle off Raw JSON Mode to use form fields instead.",
            format: "text",
          },
          {
            title: "Agent Run Example",
            body: '{\n  "message": "What is your return policy?",\n  "session_id": null,\n  "knowledge_bases": [{"id": "kb-uuid-here"}],\n  "max_context_tokens": 4096\n}',
            format: "code",
          },
          {
            title: "KB Create Example",
            body: '{\n  "name": "Product Docs",\n  "description": "All product manuals and FAQs",\n  "indexing_config": {\n    "strategy": "chunk_embed",\n    "chunk_size": 2000,\n    "overlap": 50,\n    "embedding_model": "text-embedding-3-small"\n  },\n  "retrieval_config": {\n    "method": "hybrid",\n    "top_k": 5\n  }\n}',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", value: true,
          and: { field: "resource", value: ["agents", "knowledge_bases", "context_handlers", "database"] },
        },
      },

      // ── Agents create/update fields ──────────────────────────────────
      {
        id: "agents_cu_name",
        title: "Name",
        type: "short-input",
        placeholder: "Agent name",
        required: true,
        helpSections: [
          {
            title: "",
            body: "Display name for the agent. Used to identify it in the UI and API responses. Required for Create; optional for Update (omit to keep current name).",
            format: "text",
          },
          {
            title: "Example",
            body: "Customer Support Bot",
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: ["create", "update"] } },
        },
      },
      {
        id: "agents_cu_model",
        title: "Model",
        type: "model-selector",
        placeholder: "Select a model...",
        options: MODEL_OPTIONS,
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: ["create", "update"] } },
        },
      },
      {
        id: "agents_cu_system_prompt",
        title: "System Prompt",
        type: "long-input",
        rows: 3,
        placeholder: "You are a helpful assistant...",
        helpSections: [
          {
            title: "",
            body: "Instructions that define the agent's behavior, persona, and constraints. Sent as the system message to the LLM on every request. Supports multi-line text. If omitted, the agent uses no system prompt.",
            format: "text",
          },
          {
            title: "Example",
            body: "You are a helpful customer support agent for Acme Corp.\n\nRules:\n- Only answer questions about Acme products\n- If unsure, say \"Let me connect you with a human agent\"\n- Be concise and friendly\n- Never share internal pricing or roadmap details",
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: ["create", "update"] } },
        },
      },
      {
        id: "agents_cu_settings",
        title: "Settings",
        type: "code",
        language: "json",
        rows: 3,
        placeholder: '{"temperature": 0.7}',
        helpSections: [
          {
            title: "",
            body: "Optional JSON object with LLM and agent behavior settings. All keys are optional — omit the entire object to use defaults.",
            format: "text",
          },
          {
            title: "Supported Keys",
            body: "temperature, max_tokens, top_p, frequency_penalty, presence_penalty, max_context_tokens",
            format: "pills",
          },
          {
            title: "Example",
            body: '{\n  "temperature": 0.7,\n  "max_tokens": 1024,\n  "max_context_tokens": 8000\n}',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: ["create", "update"] } },
        },
      },

      // ── Agents run fields ────────────────────────────────────────────
      {
        id: "agents_run_message",
        title: "Message",
        type: "long-input",
        rows: 3,
        required: true,
        placeholder: "Enter the message to send to the agent",
        helpSections: [
          {
            title: "",
            body: "The user message to send to the agent. This is the input the agent will respond to. Required.",
            format: "text",
          },
          {
            title: "Example",
            body: '# Hardcoded message\nWhat is your return policy for electronics?\n\n# Dynamic from upstream block\n<starter_1.output.user_query>',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: "run" } },
        },
      },
      {
        id: "agents_run_session_id",
        title: "Session ID",
        type: "short-input",
        placeholder: "Optional session UUID",
        helpSections: [
          {
            title: "",
            body: "UUID of an existing session to continue a multi-turn conversation. If omitted or blank, a new session is created automatically. The response includes the session_id so you can pass it to subsequent Run calls.",
            format: "text",
          },
          {
            title: "Example",
            body: '# From a previous agent run\n<agent_1.output.session_id>\n\n# Hardcoded UUID\nc3d4e5f6-7890-abcd-ef12-345678901234',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: "run" } },
        },
      },
      {
        id: "agents_run_kb",
        title: "Knowledge Bases",
        type: "kb-select",
        helpSections: [
          {
            title: "",
            body: "Select one or more knowledge bases for the agent to search before generating a response (RAG). The agent retrieves relevant chunks and includes them as context. Mutually exclusive with Context Handler ID — you can use one or the other, not both.",
            format: "text",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: "run" } },
        },
      },
      {
        id: "agents_run_context_handler_id",
        title: "Context Handler ID",
        type: "short-input",
        placeholder: "Optional context handler UUID",
        helpSections: [
          {
            title: "",
            body: "UUID of a previously created Context Handler. When provided, the agent uses the context handler's pre-retrieved content instead of performing its own knowledge base search. Mutually exclusive with Knowledge Bases — you can use one or the other, not both.",
            format: "text",
          },
          {
            title: "Example",
            body: '# From an upstream context handler block\n<context_handler_1.output.id>',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: "run" } },
        },
      },
      {
        id: "agents_run_max_context_tokens",
        title: "Max Context Tokens",
        type: "short-input",
        placeholder: "e.g. 4096",
        helpSections: [
          {
            title: "",
            body: "Maximum number of tokens to include from retrieved knowledge base content. Higher values provide more context but increase cost and latency. Default: 32000. Only relevant when Knowledge Bases or Context Handler ID is set.",
            format: "text",
          },
          {
            title: "Example",
            body: "4096",
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "agents",
            and: { field: "agents_operation", value: "run" } },
        },
      },

      // ── KB create/update fields ──────────────────────────────────────
      {
        id: "kb_cu_name",
        title: "Name",
        type: "short-input",
        placeholder: "Knowledge base name",
        required: true,
        helpSections: [
          {
            title: "",
            body: "Display name for the knowledge base. Required for Create; optional for Update.",
            format: "text",
          },
          {
            title: "Example",
            body: "Product Documentation",
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: ["create", "update"] } },
        },
      },
      {
        id: "kb_cu_description",
        title: "Description",
        type: "long-input",
        rows: 2,
        placeholder: "Describe this knowledge base...",
        helpSections: [
          {
            title: "",
            body: "A human-readable description of what this knowledge base contains. Helps users identify its purpose. Optional.",
            format: "text",
          },
          {
            title: "Example",
            body: "All product manuals, FAQs, and troubleshooting guides for the Acme product line.",
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: ["create", "update"] } },
        },
      },
      {
        id: "kb_cu_indexing_config",
        title: "Indexing Config",
        type: "code",
        language: "json",
        rows: 3,
        placeholder: '{"chunk_size": 512}',
        helpSections: [
          {
            title: "",
            body: "JSON object that controls how uploaded documents are processed and indexed. You must specify a \"strategy\" key, plus strategy-specific settings. If omitted, defaults to chunk_embed with chunk_size=2000, overlap=50.",
            format: "text",
          },
          {
            title: "Available Strategies",
            body: "chunk_embed, page_index, full_document, graph_index, doc2json",
            format: "pills",
          },
          {
            title: "chunk_embed (default)",
            body: '{\n  "strategy": "chunk_embed",\n  "chunk_size": 2000,\n  "overlap": 50,\n  "embedding_model": "text-embedding-3-small"\n}',
            format: "code",
          },
          {
            title: "page_index (tree-based)",
            body: '{\n  "strategy": "page_index",\n  "model": "gpt-5-mini",\n  "if_add_node_summary": "yes"\n}',
            format: "code",
          },
          {
            title: "full_document",
            body: '{\n  "strategy": "full_document",\n  "summary_model": "gpt-5-mini",\n  "embedding_model": "text-embedding-3-small"\n}',
            format: "code",
          },
          {
            title: "graph_index (graph-based)",
            body: '{\n  "strategy": "graph_index",\n  "model": "gpt-5-mini",\n  "enrichment_model": "gpt-5-mini",\n  "embedding_model": "text-embedding-3-small",\n  "if_add_node_summary": "yes"\n}',
            format: "code",
          },
          {
            title: "doc2json (structured extraction)",
            body: '{\n  "strategy": "doc2json",\n  "extraction_model": "gpt-5-mini",\n  "embedding_model": "text-embedding-3-small",\n  "window_size": 4000,\n  "window_overlap": 200,\n  "use_images": false,\n  "pages_per_window": 3,\n  "json_schema": {}\n}',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: ["create", "update"] } },
        },
      },
      {
        id: "kb_cu_retrieval_config",
        title: "Retrieval Config",
        type: "code",
        language: "json",
        rows: 3,
        placeholder: '{"top_k": 5}',
        helpSections: [
          {
            title: "",
            body: "JSON object that controls how search queries retrieve results from this knowledge base. You must specify a \"method\" key. If omitted, defaults to hybrid with top_k=5.",
            format: "text",
          },
          {
            title: "Available Methods",
            body: "hybrid, vector_search, full_text, tree_search (page_index only)",
            format: "pills",
          },
          {
            title: "hybrid (default — recommended)",
            body: '{\n  "method": "hybrid",\n  "top_k": 5,\n  "context_mode": "text",\n  "ts_language": "english"\n}',
            format: "code",
          },
          {
            title: "vector_search (semantic only)",
            body: '{\n  "method": "vector_search",\n  "top_k": 10,\n  "context_mode": "text"\n}',
            format: "code",
          },
          {
            title: "full_text (keyword search)",
            body: '{\n  "method": "full_text",\n  "top_k": 5,\n  "context_mode": "text",\n  "ts_language": "english"\n}',
            format: "code",
          },
          {
            title: "tree_search (page_index strategy only)",
            body: '{\n  "method": "tree_search",\n  "top_k": 5,\n  "retrieval_model": "gpt-5-mini",\n  "context_mode": "text"\n}',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: ["create", "update"] } },
        },
      },

      // ── KB search fields ─────────────────────────────────────────────
      {
        id: "kb_search_query",
        title: "Query",
        type: "long-input",
        rows: 2,
        required: true,
        placeholder: "Search query text",
        helpSections: [
          {
            title: "",
            body: "The search query to run against the knowledge base. Returns the most relevant chunks ranked by the knowledge base's configured retrieval method. Required.",
            format: "text",
          },
          {
            title: "Example",
            body: '# Hardcoded query\nHow do I reset my password?\n\n# Dynamic from upstream block\n<starter_1.output.question>',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: "search" } },
        },
      },
      {
        id: "kb_search_top_k",
        title: "Top K",
        type: "short-input",
        placeholder: "5",
        helpSections: [
          {
            title: "",
            body: "Maximum number of results to return. Default: 5. Higher values return more results but may include less relevant content.",
            format: "text",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: "search" } },
        },
      },
      {
        id: "kb_search_retrieval_method",
        title: "Retrieval Method",
        type: "dropdown",
        description: "Search strategy. 'similarity' uses vector embeddings for semantic matching. 'keyword' uses BM25 full-text search. 'hybrid' combines both using reciprocal rank fusion (recommended). Default: auto-detected from the KB's indexing strategy.",
        options: [
          { label: "Similarity", value: "similarity" },
          { label: "Keyword", value: "keyword" },
          { label: "Hybrid", value: "hybrid" },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: "search" } },
        },
      },
      {
        id: "kb_search_similarity_threshold",
        title: "Similarity Threshold",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0,
        helpSections: [
          {
            title: "",
            body: "Minimum cosine similarity score (0.0–1.0) to include a result. Only applies when retrieval method is 'similarity' (vector_search). Default: 0.0 (no filtering). Set to 0.5–0.7 to filter out low-relevance results.",
            format: "text",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: "search" } },
        },
      },
      {
        id: "kb_search_filter_metadata",
        title: "Filter Metadata",
        type: "code",
        language: "json",
        rows: 2,
        placeholder: '{"category": "docs"}',
        helpSections: [
          {
            title: "",
            body: "JSON object to filter search results by metadata fields attached to source documents during indexing. Filters are applied as AND conditions. Only results matching all specified key-value pairs are returned.",
            format: "text",
          },
          {
            title: "Example",
            body: '# Filter by single field\n{"category": "billing"}\n\n# Filter by multiple fields (AND)\n{"category": "billing", "language": "en"}',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "knowledge_bases",
            and: { field: "kb_operation", value: "search" } },
        },
      },

      // ── Context handlers create fields ───────────────────────────────
      {
        id: "ch_create_query",
        title: "Query",
        type: "long-input",
        rows: 2,
        required: true,
        placeholder: "Context handler query",
        helpSections: [
          {
            title: "",
            body: "The query to retrieve context for. The context handler searches all selected knowledge bases, retrieves relevant chunks, and returns a formatted context string. Required.",
            format: "text",
          },
          {
            title: "Example",
            body: '# Hardcoded\nSummarize recent policy changes\n\n# Dynamic from upstream\n<starter_1.output.user_question>',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "context_handlers",
            and: { field: "ch_operation", value: "create" } },
        },
      },
      {
        id: "ch_create_kb",
        title: "Knowledge Bases",
        type: "kb-select",
        helpSections: [
          {
            title: "",
            body: "Select one or more knowledge bases to search. The context handler queries all selected KBs and merges results into a single context string. At least one knowledge base is required.",
            format: "text",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "context_handlers",
            and: { field: "ch_operation", value: "create" } },
        },
      },
      {
        id: "ch_create_max_context_tokens",
        title: "Max Context Tokens",
        type: "short-input",
        placeholder: "e.g. 4096",
        helpSections: [
          {
            title: "",
            body: "Maximum number of tokens to include in the returned context. The context handler truncates retrieved content to fit within this limit. Default: 32000.",
            format: "text",
          },
          {
            title: "Example",
            body: "4096",
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "context_handlers",
            and: { field: "ch_operation", value: "create" } },
        },
      },

      // ── Database CRUD fields ─────────────────────────────────────────
      {
        id: "db_schema",
        title: "Schema",
        type: "short-input",
        placeholder: "public",
        description: "Database schema. Defaults to public if empty.",
        helpSections: [
          {
            title: "",
            body: "Database schema to operate on. Leave empty or set to 'public' for the default public schema.",
            format: "text",
          },
          {
            title: "Warning",
            body: "Modifying tables in protected schemas (ai, auth, storage) directly may break platform functionality. Use with caution.",
            format: "text",
          },
        ],
        condition: {
          field: "resource", value: "database",
          and: { field: "db_operation", value: ["list_tables", "list", "get", "create", "update", "delete"] },
        },
      },
      {
        id: "db_table",
        title: "Table Name",
        type: "short-input",
        required: true,
        placeholder: "e.g. users",
        description: "Name of the table.",
        helpSections: [
          {
            title: "",
            body: "Name of the table to operate on. Must contain only letters, numbers, and underscores, and start with a letter or underscore. Use the Schema field to control which schema to query. Required for all database operations except List Tables.",
            format: "text",
          },
          {
            title: "Example",
            body: "users\norders\nproduct_reviews",
            format: "code",
          },
        ],
        condition: {
          field: "resource", value: "database",
          and: { field: "db_operation", value: ["list", "get", "create", "update", "delete"] },
        },
      },
      {
        id: "db_row_id",
        title: "Row ID",
        type: "short-input",
        placeholder: "Row ID",
        helpSections: [
          {
            title: "",
            body: "The primary key value (id column) of the row to get, update, or delete. Required for Get Row, Update Row, and Delete Row. Not used for List Rows or Create Row.",
            format: "text",
          },
          {
            title: "Example",
            body: '# Hardcoded ID\n42\n\n# From an upstream block\n<database_1.output.id>\n<starter_1.output.row_id>',
            format: "code",
          },
        ],
        condition: {
          field: "resource", value: "database",
          and: { field: "db_operation", value: ["get", "update", "delete"] },
        },
      },
      {
        id: "db_body",
        title: "Row Data",
        type: "code",
        language: "json",
        rows: 4,
        placeholder: '{"column": "value"}',
        description: "JSON object of column→value pairs.",
        helpSections: [
          {
            title: "",
            body: "JSON object representing the row data. Keys are column names, values are the data to insert or update. For Create Row, include all required columns. For Update Row, include only the columns you want to change. Sent directly to PostgREST.",
            format: "text",
          },
          {
            title: "Create Row Example",
            body: '{\n  "name": "Jane Doe",\n  "email": "jane@example.com",\n  "role": "admin",\n  "is_active": true\n}',
            format: "code",
          },
          {
            title: "Update Row Example (partial)",
            body: '{\n  "role": "superadmin",\n  "is_active": false\n}',
            format: "code",
          },
        ],
        condition: {
          field: "use_raw_json", not: true, value: true,
          and: { field: "resource", value: "database",
            and: { field: "db_operation", value: ["create", "update"] } },
        },
      },
      {
        id: "db_list_limit",
        title: "Limit",
        type: "short-input",
        placeholder: "50",
        description: "Maximum number of results to return. Default: 50.",
        condition: {
          field: "resource", value: "database",
          and: { field: "db_operation", value: "list" },
        },
      },
      {
        id: "db_list_offset",
        title: "Offset",
        type: "short-input",
        placeholder: "0",
        description: "Number of results to skip for pagination. Use with Limit to page through results. Example: Limit=50, Offset=50 returns results 51-100. Default: 0.",
        condition: {
          field: "resource", value: "database",
          and: { field: "db_operation", value: "list" },
        },
      },

      // ── GET/list fields (not gated by use_raw_json) ──────────────────
      // Agents list
      {
        id: "agents_list_limit",
        title: "Limit",
        type: "short-input",
        placeholder: "50",
        description: "Maximum number of results to return. Default: 50.",
        condition: {
          field: "resource", value: "agents",
          and: { field: "agents_operation", value: "list" },
        },
      },
      {
        id: "agents_list_offset",
        title: "Offset",
        type: "short-input",
        placeholder: "0",
        description: "Number of results to skip for pagination. Use with Limit to page through results. Example: Limit=50, Offset=50 returns results 51-100. Default: 0.",
        condition: {
          field: "resource", value: "agents",
          and: { field: "agents_operation", value: "list" },
        },
      },
      // KB list
      {
        id: "kb_list_limit",
        title: "Limit",
        type: "short-input",
        placeholder: "50",
        description: "Maximum number of results to return. Default: 50.",
        condition: {
          field: "resource", value: "knowledge_bases",
          and: { field: "kb_operation", value: "list" },
        },
      },
      {
        id: "kb_list_offset",
        title: "Offset",
        type: "short-input",
        placeholder: "0",
        description: "Number of results to skip for pagination. Use with Limit to page through results. Example: Limit=50, Offset=50 returns results 51-100. Default: 0.",
        condition: {
          field: "resource", value: "knowledge_bases",
          and: { field: "kb_operation", value: "list" },
        },
      },
      // Sources list
      {
        id: "sources_list_limit",
        title: "Limit",
        type: "short-input",
        placeholder: "50",
        description: "Maximum number of results to return. Default: 50.",
        condition: {
          field: "resource", value: "sources",
          and: { field: "sources_operation", value: "list" },
        },
      },
      {
        id: "sources_list_offset",
        title: "Offset",
        type: "short-input",
        placeholder: "0",
        description: "Number of results to skip for pagination. Use with Limit to page through results. Example: Limit=50, Offset=50 returns results 51-100. Default: 0.",
        condition: {
          field: "resource", value: "sources",
          and: { field: "sources_operation", value: "list" },
        },
      },
      {
        id: "sources_list_status",
        title: "Status Filter",
        type: "dropdown",
        description: "Filter sources by processing status. Statuses: Pending (uploaded, not yet processed), Processing (extraction in progress), Completed (successfully extracted), Failed (extraction error). Select 'All' to return every source.",
        options: [
          { label: "All", value: "all" },
          { label: "Pending", value: "pending" },
          { label: "Processing", value: "processing" },
          { label: "Completed", value: "completed" },
          { label: "Failed", value: "failed" },
        ],
        condition: {
          field: "resource", value: "sources",
          and: { field: "sources_operation", value: "list" },
        },
      },
      // Context handlers list
      {
        id: "ch_list_limit",
        title: "Limit",
        type: "short-input",
        placeholder: "50",
        description: "Maximum number of results to return. Default: 50.",
        condition: {
          field: "resource", value: "context_handlers",
          and: { field: "ch_operation", value: "list" },
        },
      },
      {
        id: "ch_list_offset",
        title: "Offset",
        type: "short-input",
        placeholder: "0",
        description: "Number of results to skip for pagination. Use with Limit to page through results. Example: Limit=50, Offset=50 returns results 51-100. Default: 0.",
        condition: {
          field: "resource", value: "context_handlers",
          and: { field: "ch_operation", value: "list" },
        },
      },
      // Sessions list_messages
      {
        id: "sessions_messages_limit",
        title: "Limit",
        type: "short-input",
        placeholder: "50",
        description: "Maximum number of messages to return from the session's conversation history. Messages are returned in chronological order. Default: all messages.",
        helpSections: [
          {
            title: "",
            body: "Maximum number of messages to return from the session's conversation history. Messages are returned in chronological order. Default: all messages.",
            format: "text",
          },
        ],
        condition: {
          field: "resource", value: "sessions",
          and: { field: "sessions_operation", value: "list_messages" },
        },
      },
    ],
    hasInput: true,
    hasOutput: true,
  },

  general_api: {
    type: "general_api",
    name: "General API",
    description: "Make an HTTP request",
    icon: "Globe",
    color: "blue",
    outputs: { output: { type: "json", description: "Response data" } },
    docs: {
      input:
        "Use <blockId.output> references in URL, headers, or body.",
      output:
        "Outputs the JSON response body. Reference as <general_api_1.output>.",
    },
    copilot: {
      whenToUse: "Make HTTP requests to external APIs (Slack, Stripe, SendGrid, etc.) or any endpoint not covered by the Platform API block. Use for all third-party integrations.",
      useCases: [
        "Post a message to Slack",
        "Create a Stripe charge or retrieve customer data",
        "Send an email via SendGrid or similar",
        "Call any REST API with dynamic parameters",
      ],
      constraints: [
        "URL is required.",
        "Body is only relevant for POST, PUT, and PATCH methods.",
        "Block references (`<blockId.output>` syntax) work in URL, headers, params, and body.",
        "Default timeout is 30 seconds (30000ms).",
      ],
      outputShape: { output: "Parsed JSON response body" },
      connectionPatterns: {
        upstream: [
          { type: "starter", reason: "Use input values in API calls" },
          { type: "code", reason: "Use computed/formatted data" },
          { type: "agent", reason: "Use LLM output in API calls" },
        ],
        downstream: [
          { type: "code", reason: "Process API response" },
          { type: "agent", reason: "Reason about API response" },
          { type: "response", reason: "Return API result" },
        ],
      },
      exampleSnippets: [],
    },
    subBlocks: [
      {
        id: "url",
        title: "URL",
        type: "short-input",
        required: true,
        placeholder: "https://api.example.com/endpoint",
        description:
          "The request URL. Supports block references for dynamic values.",
        copilotHint: "Full URL including protocol. Use `<blockId.output.field>` for dynamic path segments.",
        example:
          "https://api.example.com/users/<starter_1.output.user_id>",
      },
      {
        id: "method",
        title: "Method",
        type: "dropdown",
        defaultValue: "GET",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
          { label: "PUT", value: "PUT" },
          { label: "PATCH", value: "PATCH" },
          { label: "DELETE", value: "DELETE" },
        ],
      },
      {
        id: "params",
        title: "Query Parameters",
        type: "table",
        columns: ["Key", "Value"],
        description: "URL query parameters",
      },
      {
        id: "headers",
        title: "Headers",
        type: "table",
        columns: ["Key", "Value"],
        description: "Request headers as key-value pairs.",
      },
      {
        id: "body",
        title: "Body",
        type: "code",
        language: "json",
        rows: 4,
        placeholder: '{"key": "value"}',
        description: "Request body as JSON. Supports block references.",
        example:
          '{\n  "query": "<starter_1.output.query>",\n  "limit": 10\n}',
      },
      {
        id: "timeout",
        title: "Timeout (ms)",
        type: "short-input",
        placeholder: "30000",
        mode: "advanced",
        description: "Request timeout in milliseconds",
      },
    ],
    hasInput: true,
    hasOutput: true,
  },
};

/**
 * Get default config values for a block type.
 */
export function getDefaultConfig(blockType: string): Record<string, unknown> {
  const typeConfig = blockRegistry[blockType];
  if (!typeConfig) return {};

  const config: Record<string, unknown> = {};
  for (const sb of typeConfig.subBlocks) {
    if (sb.defaultValue !== undefined) {
      config[sb.id] = sb.defaultValue;
    } else if (sb.type === "kb-select") {
      config[sb.id] = [];
    } else if (sb.type === "switch") {
      config[sb.id] = false;
    } else if (sb.type === "slider") {
      config[sb.id] = sb.min ?? 0;
    } else if (sb.type === "checkbox-group") {
      config[sb.id] = sb.defaultValue ?? [];
    } else if (sb.type === "json-kv") {
      config[sb.id] = {};
    } else if (sb.type === "table") {
      const cells: Record<string, string> = {};
      for (const col of sb.columns ?? []) cells[col] = "";
      config[sb.id] = [{ cells }];
    } else {
      config[sb.id] = "";
    }
  }
  if (blockType === "split") {
    config.branches = 2;
  }
  if (blockType === "condition") {
    config.branches = [{ expression: "" }];
  }
  return config;
}

// ─── Copilot system context ────────────────────────────────────────────────

/**
 * Structured context for the workflow builder copilot.
 * Injected into the copilot's system prompt so it can construct and modify
 * workflows from natural language.
 */
export const copilotSystemContext = {
  referenceSyntax: {
    blockOutput: "<blockId.output>",
    blockOutputField: "<blockId.output.field>",
    description:
      "Use angle-bracket references to wire data between blocks. `<blockId.output>` returns the entire output; `<blockId.output.field>` drills into a specific key.",
  },
  blockIdConvention: {
    pattern: "type_N",
    examples: ["starter_1", "agent_2", "code_1", "condition_1"],
    description:
      "Block IDs follow the pattern `type_N` where type is the block type and N is a sequential number starting at 1.",
  },
  edgeSemantics: {
    description:
      "An edge from source to target means source runs before target. The target can reference the source's output.",
    conditionEdges:
      "Condition block edges use `sourceHandle` to indicate the branch: 'if', 'elif_1', 'elif_2', ..., or 'else'.",
    splitEdges:
      "Split block edges fan out — all downstream blocks receive the same data.",
  },
  workflowRules: [
    "Every workflow must have exactly one trigger block (starter or webhook).",
    "An optional response block can serve as the terminal node to return data to the caller.",
    "Blocks execute in topological order — a block only runs after all upstream blocks finish.",
    "Block references can only point to upstream blocks (blocks that have already executed).",
  ],
  configDefaults:
    "Use `getDefaultConfig(blockType)` to get default config values. Only set fields that differ from defaults.",
  copilotBehaviorRules: [
    "Before creating or modifying a workflow, gather all required information from the user. If the expected data shape is ambiguous (e.g., webhook payload structure, external API response format), ask the user to clarify before proceeding.",
    "Only begin workflow creation or modification after all necessary details are confirmed.",
    "When uncertain about a configuration value, ask the user rather than guessing.",
  ],
} as const;
