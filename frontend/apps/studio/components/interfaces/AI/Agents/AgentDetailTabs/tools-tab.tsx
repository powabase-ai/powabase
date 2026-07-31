import { useEffect, useState } from "react";
import {
  type LucideIcon,
  Database,
  Table2,
  FolderOpen,
  Upload,
  Terminal,
  Globe,
  Search,
  FileText,
  Wrench,
  Plug,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import {
  agentToolsApi,
  type AgentToolAssignment,
  toolsApi,
  type CustomTool,
  databaseMetaApi,
  hasAiAuth,
  type SchemaInfo,
} from "@/lib/ai-api";
import { KeyValueEditor } from "@/components/interfaces/AI/Agents/KeyValueEditor";
import { JsonSchemaEditor } from "@/components/interfaces/AI/Agents/JsonSchemaEditor";

type ToolOption = {
  key: string;
  label: string;
  description: string;
  type: "boolean" | "number" | "string" | "select" | "tags";
  default: unknown;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

type BuiltinToolMeta = { name: string; description: string; icon: LucideIcon };

// Built-in tools grouped by capability. Every tool's config renders inline
// under its own card (including the database table picker) so the layout is
// consistent regardless of tool — no detached config sections.
const TOOL_GROUPS: Array<{ category: string; tools: BuiltinToolMeta[] }> = [
  {
    category: "Database",
    tools: [
      { name: "database_query", description: "Read-only SQL queries", icon: Database },
      { name: "database_write", description: "Insert, update, or delete records", icon: Table2 },
    ],
  },
  {
    category: "Storage",
    tools: [
      { name: "storage_read", description: "List and download storage files", icon: FolderOpen },
      { name: "storage_write", description: "Upload files to storage", icon: Upload },
    ],
  },
  {
    category: "Compute",
    tools: [
      { name: "code_execute", description: "Run Python or JavaScript in a sandbox", icon: Terminal },
    ],
  },
  {
    category: "Web",
    tools: [
      { name: "http_request", description: "Call external HTTP APIs", icon: Globe },
      { name: "web_search", description: "Search the web via Exa.ai", icon: Search },
      { name: "web_scrape", description: "Scrape web page content", icon: FileText },
    ],
  },
];

const DB_TOOLS = new Set(["database_query", "database_write"]);
const BUILTIN_TOOL_NAMES = new Set(TOOL_GROUPS.flatMap((g) => g.tools.map((t) => t.name)));

const BUILTIN_TOOL_OPTIONS: Record<string, ToolOption[]> = {
  web_scrape: [
    {
      key: "include_images",
      label: "Analyze images",
      description: "Use AI vision to describe images found on scraped pages",
      type: "boolean",
      default: false,
    },
    {
      key: "only_main_content",
      label: "Main content only",
      description: "Filter out navigation, headers, footers, and sidebars",
      type: "boolean",
      default: true,
    },
    {
      key: "mobile",
      label: "Mobile mode",
      description: "Emulate a mobile device user agent",
      type: "boolean",
      default: false,
    },
    {
      key: "wait_for",
      label: "JS wait (ms)",
      description: "Milliseconds to wait for dynamic content to load",
      type: "number",
      default: 0,
    },
  ],
  web_search: [
    {
      key: "search_type",
      label: "Search mode",
      description: "Matching algorithm, or an agentic deep-search tier",
      type: "select",
      default: "auto",
      options: [
        { value: "auto", label: "Auto (default)" },
        { value: "neural", label: "Neural (semantic)" },
        { value: "keyword", label: "Keyword (exact match)" },
        { value: "deep", label: "Deep" },
        { value: "deep-reasoning", label: "Deep + Reasoning" },
      ],
    },
    {
      key: "content_mode",
      label: "Content depth",
      description: "How much content to return per result",
      type: "select",
      default: "highlights",
      options: [
        { value: "highlights", label: "Highlights (default)" },
        { value: "compact_text", label: "Compact text" },
        { value: "full_text", label: "Full text" },
      ],
    },
    {
      key: "include_domains",
      label: "Include domains",
      description: "Only return results from these domains",
      type: "tags",
      default: [],
      placeholder: "e.g. arxiv.org",
    },
    {
      key: "exclude_domains",
      label: "Exclude domains",
      description: "Filter out results from these domains",
      type: "tags",
      default: [],
      placeholder: "e.g. pinterest.com",
    },
  ],
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        checked ? "bg-brand-500" : "bg-surface-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

interface ToolsTabProps {
  agentId: string;
}

export function ToolsTab({ agentId }: ToolsTabProps) {
  const { token, ref, isReady } = useProjectSupabaseClient();

  const [assignments, setAssignments] = useState<AgentToolAssignment[]>([]);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Schema picker for database tools
  const [dbSchemas, setDbSchemas] = useState<SchemaInfo[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());

  // Create custom tool panel
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newTool, setNewTool] = useState({
    name: "",
    description: "",
    endpoint_url: "",
    http_method: "POST",
    headers: {} as Record<string, string>,
    input_schema: null as Record<string, unknown> | null,
    timeout: 30,
  });
  const [isCreating, setIsCreating] = useState(false);
  // Blocks Create while the tool's Input Schema editor holds invalid JSON —
  // otherwise the last VALID schema is silently submitted instead of the edit.
  const [toolSchemaValid, setToolSchemaValid] = useState(true);

  const fetchData = async (showLoading = false) => {
    if (!isReady || !hasAiAuth(token)) return;
    if (showLoading) setIsLoading(true);
    try {
      const [toolsRes, customRes] = await Promise.all([
        agentToolsApi.list(token, ref, agentId),
        toolsApi.list(token, ref),
      ]);
      setAssignments(toolsRes.tools);
      // Filter out builtins — they're shown in the dedicated builtin section
      setCustomTools(customRes.tools.filter((t) => !BUILTIN_TOOL_NAMES.has(t.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tools");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, [isReady, token, agentId]);

  const isBuiltinAssigned = (toolName: string) =>
    assignments.some((a) => a.tool_type === "builtin" && a.tool_name === toolName);

  const toggleBuiltin = async (toolName: string) => {
    if (!hasAiAuth(token)) return;
    const existing = assignments.find(
      (a) => a.tool_type === "builtin" && a.tool_name === toolName
    );
    try {
      if (existing) {
        await agentToolsApi.remove(token, ref, agentId, existing.id);
      } else {
        await agentToolsApi.assign(token, ref, agentId, {
          tool_type: "builtin",
          tool_name: toolName,
        });
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle tool");
    }
  };

  const updateToolOption = async (toolName: string, key: string, value: unknown) => {
    if (!hasAiAuth(token)) return;
    const assignment = assignments.find(
      (a) => a.tool_type === "builtin" && a.tool_name === toolName
    );
    if (!assignment) return;
    const current = (assignment.config_override as Record<string, unknown>) || {};
    const optDef = BUILTIN_TOOL_OPTIONS[toolName]?.find((o) => o.key === key);
    const isDefault =
      optDef &&
      (value === optDef.default ||
        (optDef.type === "tags" && Array.isArray(value) && (value as unknown[]).length === 0) ||
        (optDef.type === "number" && (value === 0 || value === "")));
    const updated = { ...current };
    if (isDefault) {
      delete updated[key];
    } else {
      updated[key] = value;
    }
    try {
      await agentToolsApi.updateConfig(token, ref, agentId, assignment.id, updated);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tool config");
    }
  };

  const isCustomAssigned = (toolId: string) =>
    assignments.some((a) => a.tool_type === "custom" && a.tool_id === toolId);

  const toggleCustom = async (tool: CustomTool) => {
    if (!hasAiAuth(token)) return;
    const existing = assignments.find(
      (a) => a.tool_type === "custom" && a.tool_id === tool.id
    );
    try {
      if (existing) {
        await agentToolsApi.remove(token, ref, agentId, existing.id);
      } else {
        await agentToolsApi.assign(token, ref, agentId, {
          tool_type: "custom",
          tool_name: tool.name,
          tool_id: tool.id,
        });
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle tool");
    }
  };

  const handleCreateTool = async () => {
    if (!hasAiAuth(token) || !newTool.name.trim()) return;
    setIsCreating(true);
    try {
      await toolsApi.create(token, ref, {
        name: newTool.name.trim(),
        description: newTool.description || undefined,
        type: "http",
        input_schema: newTool.input_schema || undefined,
        config: {
          endpoint_url: newTool.endpoint_url,
          http_method: newTool.http_method,
          headers: newTool.headers,
          timeout: newTool.timeout,
        },
      });
      setShowCreatePanel(false);
      setNewTool({
        name: "",
        description: "",
        endpoint_url: "",
        http_method: "POST",
        headers: {},
        input_schema: null,
        timeout: 30,
      });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tool");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTool = async (toolId: string) => {
    if (!hasAiAuth(token) || !confirm("Delete this custom tool?")) return;
    try {
      await toolsApi.delete(token, ref, toolId);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tool");
    }
  };

  // MCP tools (read-only, from assignments)
  const mcpAssignments = assignments.filter((a) => a.tool_type === "mcp");

  const dbToolAssignments = assignments.filter(
    (a) => a.tool_type === "builtin" && DB_TOOLS.has(a.tool_name)
  );
  const hasDbTool = dbToolAssignments.length > 0;

  const currentDbConfig = dbToolAssignments[0]?.config_override as Record<string, unknown> | null;
  const selectedSchemas: Record<string, string[]> =
    (currentDbConfig?.schemas as Record<string, string[]>) || {};

  useEffect(() => {
    if (!hasDbTool || !hasAiAuth(token)) return;
    setIsLoadingSchemas(true);
    databaseMetaApi
      .getSchemasAndTables(token, ref)
      .then((res) => setDbSchemas(res.schemas))
      .catch(() => setDbSchemas([]))
      .finally(() => setIsLoadingSchemas(false));
  }, [hasDbTool, token, ref]);

  const toggleTable = async (schema: string, table: string) => {
    if (!hasAiAuth(token)) return;
    const current = { ...selectedSchemas };
    const tables = current[schema] || [];
    if (tables.includes(table)) {
      current[schema] = tables.filter((t) => t !== table);
      if (current[schema].length === 0) delete current[schema];
    } else {
      current[schema] = [...tables, table];
    }
    for (const a of dbToolAssignments) {
      await agentToolsApi.updateConfig(token, ref, agentId, a.id, { schemas: current });
    }
    await fetchData();
  };

  // --- inline config renderers --------------------------------------------

  const renderOption = (
    toolName: string,
    opt: ToolOption,
    configOverride: Record<string, unknown>
  ) => {
    const currentValue = configOverride[opt.key] ?? opt.default;
    if (opt.type === "boolean") {
      return (
        <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => updateToolOption(toolName, opt.key, e.target.checked)}
            className="h-3.5 w-3.5 rounded border-default text-brand-600"
          />
          <span className="text-sm text-foreground">{opt.label}</span>
          <span className="text-xs text-foreground-muted">— {opt.description}</span>
        </label>
      );
    }
    if (opt.type === "select") {
      return (
        <label key={opt.key} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground w-28">{opt.label}</span>
          <select
            value={String(currentValue)}
            onChange={(e) => updateToolOption(toolName, opt.key, e.target.value)}
            className="px-2 py-1 bg-surface-300 border border-default rounded text-sm text-foreground"
          >
            {opt.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-foreground-muted">— {opt.description}</span>
        </label>
      );
    }
    if (opt.type === "number") {
      return (
        <label key={opt.key} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground w-28">{opt.label}</span>
          <input
            type="number"
            value={Number(currentValue) || ""}
            onChange={(e) => updateToolOption(toolName, opt.key, parseInt(e.target.value) || 0)}
            placeholder="0"
            className="w-20 px-2 py-1 bg-surface-300 border border-default rounded text-sm text-foreground"
          />
          <span className="text-xs text-foreground-muted">— {opt.description}</span>
        </label>
      );
    }
    if (opt.type === "tags") {
      const tags = (Array.isArray(currentValue) ? currentValue : []) as string[];
      return (
        <div key={opt.key} className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-sm text-foreground">{opt.label}</span>
            <span className="text-xs text-foreground-muted">— {opt.description}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-300 text-xs rounded-md"
              >
                {tag}
                <button
                  onClick={() => updateToolOption(toolName, opt.key, tags.filter((_, j) => j !== i))}
                  className="hover:text-destructive-600"
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder={opt.placeholder}
              className="px-2 py-0.5 bg-transparent text-sm text-foreground outline-none w-32"
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && e.currentTarget.value.trim()) {
                  e.preventDefault();
                  const val = e.currentTarget.value.trim();
                  if (!tags.includes(val)) {
                    updateToolOption(toolName, opt.key, [...tags, val]);
                  }
                  e.currentTarget.value = "";
                }
              }}
            />
          </div>
        </div>
      );
    }
    return null;
  };

  const renderDbTables = () => (
    <div>
      <p className="text-xs text-foreground-muted mb-2">
        Tables this agent can access. With none selected, database tools are disabled at run time.
      </p>
      {isLoadingSchemas ? (
        <div className="flex items-center py-2">
          <div className="animate-spin h-4 w-4 border-2 border-brand-400 border-t-transparent rounded-full" />
        </div>
      ) : dbSchemas.length === 0 ? (
        <p className="text-xs text-foreground-muted italic">
          No tables found. Create tables in the SQL Editor first.
        </p>
      ) : (
        <div className="space-y-1">
          {dbSchemas.map((schema) => {
            const expanded = expandedSchemas.has(schema.name);
            return (
              <div key={schema.name}>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(expandedSchemas);
                    next.has(schema.name) ? next.delete(schema.name) : next.add(schema.name);
                    setExpandedSchemas(next);
                  }}
                  className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-brand-600"
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{schema.name}</span>
                  <span className="text-xs text-foreground-muted font-normal">
                    ({schema.tables.length} table{schema.tables.length !== 1 ? "s" : ""})
                  </span>
                </button>
                {expanded && (
                  <div className="ml-5 mt-1 space-y-1">
                    {schema.tables.map((table) => {
                      const isSelected = (selectedSchemas[schema.name] || []).includes(table.name);
                      return (
                        <div key={table.name}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTable(schema.name, table.name)}
                              className="h-3.5 w-3.5 rounded border-default text-brand-600"
                            />
                            <span className="text-sm text-foreground">{table.name}</span>
                          </label>
                          {isSelected && (
                            <div className="ml-6 text-[10px] text-foreground-muted font-mono mt-0.5">
                              {table.columns.map((c) => (
                                <span key={c.name} className="mr-2">
                                  {c.name} <span className="text-foreground-lighter">{c.type}</span>
                                  {c.is_pk && <span className="text-brand-600"> PK</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-3 bg-destructive-200 border border-destructive-300 rounded-lg text-sm text-destructive-600">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Built-in Tools — grouped by capability, config inline under each tool */}
      <section className="space-y-5">
        {TOOL_GROUPS.map((group) => (
          <div key={group.category}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted mb-2">
              {group.category}
            </h4>
            <div className="space-y-2">
              {group.tools.map((tool) => {
                const assigned = isBuiltinAssigned(tool.name);
                const assignment = assignments.find(
                  (a) => a.tool_type === "builtin" && a.tool_name === tool.name
                );
                const configOverride =
                  (assignment?.config_override as Record<string, unknown>) || {};
                const options = BUILTIN_TOOL_OPTIONS[tool.name];
                const isDb = DB_TOOLS.has(tool.name);
                // The table-picker is SHARED across DB tools (toggleTable writes
                // the same {schemas} to every DB assignment), so render it once —
                // under the first enabled DB tool — to avoid a duplicate tree.
                const firstAssignedDbTool = group.tools.find(
                  (t) => DB_TOOLS.has(t.name) && isBuiltinAssigned(t.name)
                )?.name;
                const hasConfig = isDb || (options && options.length > 0);
                const Icon = tool.icon;

                return (
                  <div
                    key={tool.name}
                    className={`rounded-lg border bg-surface-100 overflow-hidden transition-colors ${
                      assigned ? "border-default" : "border-muted"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
                          assigned
                            ? "border-default bg-surface-200 text-foreground"
                            : "border-muted bg-surface-200 text-foreground-muted"
                        }`}
                      >
                        <Icon size={17} strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{tool.name}</div>
                        <div className="text-xs text-foreground-muted">{tool.description}</div>
                      </div>
                      <Toggle checked={assigned} onChange={() => toggleBuiltin(tool.name)} />
                    </div>
                    {assigned && hasConfig && (
                      <div className="border-t border-muted bg-surface-200/40 px-3 py-3 pl-[3.75rem] space-y-2">
                        {isDb ? (
                          tool.name === firstAssignedDbTool ? (
                            renderDbTables()
                          ) : (
                            <p className="text-xs text-foreground-muted">
                              Table access is shared across database tools — set it under{" "}
                              <span className="font-medium text-foreground">
                                {firstAssignedDbTool}
                              </span>
                              .
                            </p>
                          )
                        ) : (
                          (options ?? []).map((opt) =>
                            renderOption(tool.name, opt, configOverride)
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Custom Tools */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">Custom Tools</h3>
          <button
            onClick={() => setShowCreatePanel(true)}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-500"
          >
            <Plus size={14} /> Create Tool
          </button>
        </div>

        {customTools.length === 0 && !showCreatePanel ? (
          <p className="text-sm text-foreground-muted">No custom tools yet.</p>
        ) : (
          <div className="space-y-2">
            {customTools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center gap-3 p-3 bg-surface-100 border border-muted rounded-lg"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-muted bg-surface-200 text-foreground-muted">
                  <Wrench size={17} strokeWidth={1.5} />
                </div>
                <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">{tool.name}</span>
                    {tool.config && "endpoint_url" in tool.config && (
                      <div className="text-xs text-foreground-muted truncate">
                        {String(tool.config.http_method ?? "POST")}{" "}
                        {String(tool.config.endpoint_url)}
                      </div>
                    )}
                  </div>
                </label>
                <Toggle
                  checked={isCustomAssigned(tool.id)}
                  onChange={() => toggleCustom(tool)}
                />
                <button
                  onClick={() => handleDeleteTool(tool.id)}
                  className="text-foreground-muted hover:text-destructive-600"
                  aria-label="Remove tool"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Create panel */}
        {showCreatePanel && (
          <div className="mt-4 p-4 bg-surface-100 border border-default rounded-xl space-y-4">
            <h4 className="text-sm font-medium text-foreground">New Custom Tool</h4>
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Name</label>
              <input
                type="text"
                value={newTool.name}
                onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Description</label>
              <input
                type="text"
                value={newTool.description}
                onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-foreground-lighter mb-1">HTTP Method</label>
                <select
                  value={newTool.http_method}
                  onChange={(e) => setNewTool({ ...newTool, http_method: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-foreground-lighter mb-1">Timeout (s)</label>
                <input
                  type="number"
                  value={newTool.timeout}
                  onChange={(e) =>
                    setNewTool({ ...newTool, timeout: parseInt(e.target.value) || 30 })
                  }
                  className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Endpoint URL</label>
              <input
                type="text"
                value={newTool.endpoint_url}
                onChange={(e) => setNewTool({ ...newTool, endpoint_url: e.target.value })}
                placeholder="https://api.example.com/action"
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Headers</label>
              <KeyValueEditor
                value={newTool.headers}
                onChange={(h) => setNewTool({ ...newTool, headers: h })}
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">
                Input Schema (JSON)
              </label>
              <JsonSchemaEditor
                value={newTool.input_schema}
                onChange={(s) => setNewTool({ ...newTool, input_schema: s })}
                onValidityChange={setToolSchemaValid}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateTool}
                disabled={isCreating || !newTool.name.trim() || !toolSchemaValid}
                className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => setShowCreatePanel(false)}
                className="px-4 py-2 bg-surface-200 hover:bg-surface-300 text-foreground text-sm rounded-md transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* MCP Tools (read-only) */}
      {mcpAssignments.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-foreground mb-3">MCP Tools (read-only)</h3>
          <p className="text-xs text-foreground-muted mb-2">
            Auto-discovered from MCP servers. Manage servers on the MCP Servers tab.
          </p>
          <div className="space-y-1.5">
            {mcpAssignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2.5 p-2.5 bg-surface-100 border border-muted rounded-lg"
              >
                <Plug size={15} strokeWidth={1.5} className="text-foreground-muted shrink-0" />
                <span className="font-mono text-xs text-foreground">{a.tool_name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
