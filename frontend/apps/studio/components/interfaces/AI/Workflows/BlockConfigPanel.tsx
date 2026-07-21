

import { useState, useEffect, useRef } from "react";
import { X, Info, ChevronDown, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { blockRegistry, type SubBlockConfig, type InputMapping } from "@/data/ai-workflows/block-registry";
import { evaluateCondition } from "./condition-utils";
import { SubBlockRenderer } from "./SubBlockRenderer";
import { UpstreamGlossary } from "./UpstreamGlossary";
import type { Node, Edge } from "reactflow";

/** Sub-block types that accept text references */
const TEXT_INPUT_TYPES = new Set(["short-input", "long-input", "code"]);

interface BlockConfigPanelProps {
  node: {
    id: string;
    data: {
      blockType: string;
      label: string;
      config: Record<string, unknown>;
    };
  };
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  edges?: Edge[];
  nodes?: Node[];
  token?: string;
  projectRef?: string;
}

const DASHED_DIVIDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(to right, hsl(var(--border-default)) 0px, hsl(var(--border-default)) 6px, transparent 6px, transparent 12px)",
} as const;

// ── Platform API body assembly ──────────────────────────────────────────
// Maps (resource, operation) -> list of "configKey:apiFieldName" pairs
const BODY_FIELDS: Record<string, Record<string, string[]>> = {
  agents: {
    create: ["agents_cu_name:name", "agents_cu_model:model", "agents_cu_system_prompt:system_prompt", "agents_cu_settings:settings"],
    update: ["agents_cu_name:name", "agents_cu_model:model", "agents_cu_system_prompt:system_prompt", "agents_cu_settings:settings"],
    run: ["agents_run_message:message", "agents_run_session_id:session_id", "agents_run_kb:knowledge_bases", "agents_run_context_handler_id:context_handler_id", "agents_run_max_context_tokens:max_context_tokens"],
  },
  knowledge_bases: {
    create: ["kb_cu_name:name", "kb_cu_description:description", "kb_cu_indexing_config:indexing_config", "kb_cu_retrieval_config:retrieval_config"],
    update: ["kb_cu_name:name", "kb_cu_description:description", "kb_cu_indexing_config:indexing_config", "kb_cu_retrieval_config:retrieval_config"],
    search: ["kb_search_query:query", "kb_search_top_k:top_k", "kb_search_retrieval_method:retrieval_method", "kb_search_similarity_threshold:similarity_threshold", "kb_search_filter_metadata:filter_metadata"],
  },
  context_handlers: {
    create: ["ch_create_query:query", "ch_create_kb:knowledge_bases", "ch_create_max_context_tokens:max_context_tokens"],
  },
  database: {
    query: ["db_query_sql:sql"],
  },
};

// Maps (resource, operation) -> list of "configKey:paramName" for GET query params
const PARAM_FIELDS: Record<string, Record<string, string[]>> = {
  agents: { list: ["agents_list_limit:limit", "agents_list_offset:offset"] },
  knowledge_bases: { list: ["kb_list_limit:limit", "kb_list_offset:offset"] },
  sources: { list: ["sources_list_limit:limit", "sources_list_offset:offset", "sources_list_status:status"] },
  context_handlers: { list: ["ch_list_limit:limit", "ch_list_offset:offset"] },
  sessions: { list_messages: ["sessions_messages_limit:limit"] },
};

const OPERATION_KEY_MAP: Record<string, string> = {
  agents: "agents_operation",
  knowledge_bases: "kb_operation",
  sources: "sources_operation",
  sessions: "sessions_operation",
  context_handlers: "ch_operation",
  database: "db_operation",
};

/** Set of sub-block IDs that are JSON code editors */
const JSON_CODE_BLOCK_IDS = new Set(
  blockRegistry.platform_api?.subBlocks
    .filter((sb) => sb.type === "code" && sb.language === "json")
    .map((sb) => sb.id) ?? []
);

export function BlockConfigPanel({
  node,
  onUpdate,
  onClose,
  edges = [],
  nodes = [],
  token,
  projectRef,
}: BlockConfigPanelProps) {
  const [docsOpen, setDocsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const blockType = node.data.blockType;
  const typeConfig = blockRegistry[blockType];
  const config = node.data.config ?? {};

  // Assemble form fields into config.body / config.params when in form mode
  const prevSyncRef = useRef<string>("");
  useEffect(() => {
    if (!typeConfig || blockType !== "platform_api") return;
    const resource = config.resource as string;
    const useRawJson = config.use_raw_json as boolean;
    if (!resource) return;

    const operationKey = OPERATION_KEY_MAP[resource];
    const operation = operationKey ? (config[operationKey] as string) : "";
    if (!operation) return;

    // Assemble body fields (only when NOT in raw JSON mode)
    const bodyFieldMap = BODY_FIELDS[resource]?.[operation];
    let assembledBody: Record<string, unknown> | undefined;
    if (bodyFieldMap && !useRawJson) {
      assembledBody = {};
      const extra = config._extra_body_fields as Record<string, unknown> | undefined;
      if (extra) Object.assign(assembledBody, extra);
      for (const mapping of bodyFieldMap) {
        const [configKey, apiField] = mapping.split(":");
        const val = config[configKey];
        if (val !== undefined && val !== "" && val !== null) {
          // Parse JSON strings only for sub-blocks that are JSON code editors
          if (typeof val === "string" && JSON_CODE_BLOCK_IDS.has(configKey)) {
            try { assembledBody[apiField] = JSON.parse(val); } catch { assembledBody[apiField] = val; }
          } else {
            assembledBody[apiField] = val;
          }
        }
      }
    }

    // Assemble param fields (for GET operations)
    const paramFieldMap = PARAM_FIELDS[resource]?.[operation];
    let assembledParams: Record<string, unknown> | undefined;
    if (paramFieldMap) {
      assembledParams = {};
      for (const mapping of paramFieldMap) {
        const [configKey, paramName] = mapping.split(":");
        const val = config[configKey];
        if (val !== undefined && val !== "" && val !== null) {
          assembledParams[paramName] = val;
        }
      }
    }

    // Build a fingerprint to avoid infinite update loops
    const fingerprint = JSON.stringify({ body: assembledBody, params: assembledParams });
    if (fingerprint === prevSyncRef.current) return;
    prevSyncRef.current = fingerprint;

    const updates: Record<string, unknown> = {};
    if (assembledBody !== undefined) {
      updates.body = Object.keys(assembledBody).length > 0 ? JSON.stringify(assembledBody, null, 2) : "";
    }
    if (assembledParams !== undefined) {
      updates.params = Object.keys(assembledParams).length > 0 ? JSON.stringify(assembledParams) : "";
    }

    if (Object.keys(updates).length > 0) {
      onUpdate(node.id, { ...config, ...updates });
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // When toggling from raw JSON to form mode, parse body into form fields
  const prevRawJsonRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (!typeConfig || blockType !== "platform_api") return;
    const useRawJson = config.use_raw_json as boolean;
    const wasRawJson = prevRawJsonRef.current;
    prevRawJsonRef.current = useRawJson;

    // Switching FROM raw JSON TO form mode
    if (wasRawJson === true && !useRawJson) {
      const resource = config.resource as string;
      const operationKey = resource ? OPERATION_KEY_MAP[resource] : "";
      const operation = operationKey ? (config[operationKey] as string) : "";
      const bodyFieldMap = BODY_FIELDS[resource]?.[operation];
      const bodyStr = config.body as string;
      if (!bodyFieldMap || !bodyStr) return;

      try {
        const parsed = JSON.parse(bodyStr);
        if (typeof parsed !== "object" || parsed === null) return;
        const newConfig = { ...config };
        const knownApiFields = new Set<string>();
        for (const mapping of bodyFieldMap) {
          const [configKey, apiField] = mapping.split(":");
          knownApiFields.add(apiField);
          if (apiField in parsed) {
            const val = parsed[apiField];
            newConfig[configKey] = typeof val === "object" ? JSON.stringify(val, null, 2) : val;
          }
        }
        // Preserve unrecognized keys
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (!knownApiFields.has(k)) extra[k] = v;
        }
        newConfig._extra_body_fields = Object.keys(extra).length > 0 ? extra : undefined;
        onUpdate(node.id, newConfig);
      } catch { /* invalid JSON, leave fields empty */ }
    }
  }, [config.use_raw_json]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: get output fields for a source node
  const getSourceOutputFields = (sourceNode: Node): string[] => {
    const srcType = sourceNode.data?.blockType as string;
    if (!srcType) return ["output"];
    if (srcType === "starter") {
      const inputConfig = sourceNode.data?.config?.input;
      if (inputConfig && typeof inputConfig === "object" && !Array.isArray(inputConfig)) {
        const keys = Object.keys(inputConfig as Record<string, unknown>);
        return keys.length > 0 ? keys : [];
      }
      // Backward compat: try parsing JSON string
      if (typeof inputConfig === "string" && inputConfig.trim()) {
        try {
          const parsed = JSON.parse(inputConfig);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return Object.keys(parsed);
          }
        } catch { /* not valid JSON */ }
      }
      return [];
    }
    const srcConfig = blockRegistry[srcType];
    if (!srcConfig) return ["output"];
    const outputKeys = Object.keys(srcConfig.outputs);
    return outputKeys.length > 0 ? outputKeys : ["output"];
  };

  // Compute incoming connections
  const incomingEdges = edges.filter((e) => e.target === node.id);
  const incomingConnections = incomingEdges
    .map((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      if (!sourceNode) return null;
      return {
        sourceId: e.source,
        sourceName: sourceNode.data.label || e.source,
        outputFields: getSourceOutputFields(sourceNode),
      };
    })
    .filter(Boolean) as Array<{ sourceId: string; sourceName: string; outputFields: string[] }>;

  // Eligible target fields for input mapping (respects condition visibility)
  const eligibleFields = typeConfig
    ? typeConfig.subBlocks
        .filter((sb) => TEXT_INPUT_TYPES.has(sb.type) && !sb.noAutoMap && evaluateCondition(sb.condition, config))
        .map((sb) => ({ id: sb.id, title: sb.title }))
    : [];

  // Build flat list of all available upstream outputs
  const upstreamOutputs = incomingConnections.flatMap((conn) => {
    const fields = conn.outputFields.length > 0 ? conn.outputFields : ["output"];
    return fields.map((outputField) => ({
      value: `${conn.sourceId}::${outputField}`,
      label: outputField !== "output"
        ? `${conn.sourceName} › ${outputField}`
        : conn.sourceName,
    }));
  });

  // Given a target field, find which source::outputField is mapped to it
  const getMappedSource = (targetFieldId: string): string => {
    const mappings = (config._inputMappings as InputMapping[] | undefined) ?? [];
    const found = mappings.find((m) => m.targetField === targetFieldId);
    if (found) {
      const baseField = found.outputField.split(".")[0];
      return `${found.sourceId}::${baseField}`;
    }

    // Backward compat: scan text field for legacy <ref> strings
    const val = (config[targetFieldId] as string) ?? "";
    for (const conn of incomingConnections) {
      const fields = conn.outputFields.length > 0 ? conn.outputFields : ["output"];
      for (const outputField of fields) {
        const fieldRef = `<${conn.sourceId}.output.${outputField}>`;
        const fieldRefName = `<${conn.sourceName}.output.${outputField}>`;
        const blockRef = `<${conn.sourceId}.output>`;
        const blockRefName = `<${conn.sourceName}.output>`;
        if (val.includes(fieldRef) || val.includes(fieldRefName)) return `${conn.sourceId}::${outputField}`;
        if (outputField === "output" && (val.includes(blockRef) || val.includes(blockRefName))) return `${conn.sourceId}::${outputField}`;
      }
    }
    return "";
  };

  const getSubField = (targetFieldId: string): string => {
    const mappings = (config._inputMappings as InputMapping[] | undefined) ?? [];
    const found = mappings.find((m) => m.targetField === targetFieldId);
    if (!found) return "";
    const dotIdx = found.outputField.indexOf(".");
    return dotIdx >= 0 ? found.outputField.slice(dotIdx + 1) : "";
  };

  const handleSubFieldChange = (targetFieldId: string, subField: string) => {
    const mappings = [...((config._inputMappings as InputMapping[]) ?? [])];
    const idx = mappings.findIndex((m) => m.targetField === targetFieldId);
    if (idx < 0) return;
    const baseField = mappings[idx].outputField.split(".")[0];
    const cleaned = subField
      .replace(/^output\./, "")
      .replace(/^\.+|\.+$/g, "")
      .replace(/\.{2,}/g, ".");
    mappings[idx] = {
      ...mappings[idx],
      outputField: cleaned ? `${baseField}.${cleaned}` : baseField,
    };
    onUpdate(node.id, { ...config, _inputMappings: mappings });
  };

  const handleMappingChange = (
    targetFieldId: string,
    compositeValue: string,
  ) => {
    const mappings: InputMapping[] = [
      ...((config._inputMappings as InputMapping[]) ?? []),
    ];

    // Remove existing mapping for this target field
    const filtered = mappings.filter((m) => m.targetField !== targetFieldId);

    // Clean up any legacy text refs from the target field
    const newConfig = { ...config };
    const val = (newConfig[targetFieldId] as string) ?? "";
    if (val) {
      let cleaned = val;
      for (const conn of incomingConnections) {
        const fields = conn.outputFields.length > 0 ? conn.outputFields : ["output"];
        for (const outputField of fields) {
          cleaned = cleaned.replaceAll(`<${conn.sourceName}.output.${outputField}>`, "");
          cleaned = cleaned.replaceAll(`<${conn.sourceId}.output.${outputField}>`, "");
          if (outputField === "output") {
            cleaned = cleaned.replaceAll(`<${conn.sourceName}.output>`, "");
            cleaned = cleaned.replaceAll(`<${conn.sourceId}.output>`, "");
          }
        }
      }
      if (cleaned !== val) {
        newConfig[targetFieldId] = cleaned.replace(/\n{2,}/g, "\n").trim();
      }
    }

    // Add new mapping if a source was selected
    if (compositeValue) {
      const [sourceId, outputField] = compositeValue.split("::");
      filtered.push({ sourceId, outputField, targetField: targetFieldId });
    }

    newConfig._inputMappings = filtered;
    onUpdate(node.id, newConfig);
  };

  // Stable key derived from actual source IDs — detects identity changes, not just count
  const incomingSourceKey = incomingConnections.map((c) => c.sourceId).join(",");

  // Auto-map when there's exactly 1 eligible field AND 1 upstream output
  useEffect(() => {
    if (eligibleFields.length !== 1 || upstreamOutputs.length !== 1) return;
    const targetField = eligibleFields[0].id;
    const mappings: InputMapping[] = [
      ...((config._inputMappings as InputMapping[]) ?? []),
    ];
    const alreadyMapped = mappings.some((m) => m.targetField === targetField);
    if (alreadyMapped) return;

    const [sourceId, outputField] = upstreamOutputs[0].value.split("::");
    mappings.push({ sourceId, outputField, targetField });
    onUpdate(node.id, { ...config, _inputMappings: mappings });
  }, [node.id, incomingSourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!typeConfig) {
    return (
      <div className="w-80 bg-surface-100 border-l border-default p-4">
        <p className="text-sm text-foreground-muted">
          Unknown block type: {blockType}
        </p>
      </div>
    );
  }

  const visibleBlocks = typeConfig.subBlocks.filter((sb) =>
    evaluateCondition(sb.condition, config)
  );
  const basicBlocks = visibleBlocks.filter((sb) => sb.mode !== "advanced");
  const advancedBlocks = visibleBlocks.filter((sb) => sb.mode === "advanced");

  const renderSubBlock = (sb: SubBlockConfig) => (
    <SubBlockRenderer
      key={sb.id}
      subBlock={sb}
      value={config[sb.id]}
      onChange={(val) => onUpdate(node.id, { ...config, [sb.id]: val })}
      token={token}
      projectRef={projectRef}
      blockConfig={config}
    />
  );

  return (
    <div className="w-80 bg-surface-100 border-l border-default flex flex-col h-full" style={{ boxShadow: '-8px 0 24px rgb(0 0 0 / 0.2)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-default">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            {typeConfig.name}
          </h3>
          <p className="text-xs text-foreground-muted">
            {node.data.label || node.id}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-300 text-foreground-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Input Mapping section */}
      {incomingConnections.length > 0 && eligibleFields.length > 0 && (
        <div className="px-4 py-3 border-b border-default">
          <h4 className="text-xs uppercase tracking-wider text-foreground-muted font-medium mb-2">
            Input Mapping
          </h4>
          <div className="space-y-2">
            {eligibleFields.map((field) => {
              const mapped = getMappedSource(field.id);
              return (
                <div key={field.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground truncate min-w-0 flex-shrink">
                      {field.title}
                    </span>
                    <ArrowLeft className="h-3 w-3 text-foreground-muted flex-shrink-0" />
                    <select
                      value={mapped}
                      onChange={(e) =>
                        handleMappingChange(field.id, e.target.value)
                      }
                      className="flex-1 min-w-0 text-xs px-2 py-1 rounded border border-muted bg-surface-200 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
                    >
                      <option value="">Select source...</option>
                      {upstreamOutputs.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {mapped && (
                    <input
                      type="text"
                      value={getSubField(field.id)}
                      onChange={(e) => handleSubFieldChange(field.id, e.target.value)}
                      placeholder="Sub-field (e.g. message)"
                      className="w-full text-xs px-2 py-1 mt-1 rounded border border-muted bg-surface-200 text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upstream References glossary */}
      <UpstreamGlossary nodeId={node.id} edges={edges} nodes={nodes} />

      {/* Input / Output docs */}
      {typeConfig.docs && (typeConfig.docs.input || typeConfig.docs.output) && (
        <div className="border-b border-default">
          <button
            onClick={() => setDocsOpen((prev) => !prev)}
            className="flex items-center gap-1.5 w-full px-4 py-2 text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
            <span>Input / Output</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 ml-auto transition-transform",
                docsOpen && "rotate-180",
              )}
            />
          </button>
          {docsOpen && (
            <div className="px-4 pb-3 space-y-2">
              {typeConfig.docs.input && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-medium">
                    Input
                  </span>
                  <p className="text-xs text-foreground mt-0.5">
                    {typeConfig.docs.input}
                  </p>
                </div>
              )}
              {typeConfig.docs.output && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-medium">
                    Output
                  </span>
                  <p className="text-xs text-foreground mt-0.5">
                    {typeConfig.docs.output}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sub-block fields */}
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-2">
        {/* Warning: manual values override input mappings */}
        {incomingConnections.length > 0 && eligibleFields.length > 0 && (
          <div className="mx-2 mb-3 px-2.5 py-2 rounded bg-amber-500/25 border border-amber-300/60">
            <p className="text-[11px] text-amber-50 leading-relaxed">
              Manual values below will override input mappings for the same field.
            </p>
          </div>
        )}

        {/* Warning: non-public schema */}
        {config.resource === "database" &&
          typeof config.db_schema === "string" &&
          config.db_schema.trim() !== "" &&
          config.db_schema.trim().toLowerCase() !== "public" && (
          <div className="mx-2 mb-3 px-2.5 py-2 rounded bg-amber-500/25 border border-amber-300/60">
            <p className="text-[11px] text-amber-50 leading-relaxed">
              Warning: Modifying tables in protected schemas (e.g. ai, auth, storage) directly may cause unexpected behavior. Proceed with caution.
            </p>
          </div>
        )}

        {/* Condition branch editor */}
        {blockType === "condition" && (
          <div className="mx-2 mb-3">
            {((config.branches as Array<{ expression: string }>) ?? []).map(
              (branch, idx) => (
                <div key={idx} className="mb-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-orange-400">
                      {idx === 0 ? "If" : "Else if"}
                    </span>
                    {idx === ((config.branches as Array<{ expression: string }>) ?? []).length - 1 &&
                     ((config.branches as Array<{ expression: string }>) ?? []).length > 1 && (
                      <button
                        onClick={() => {
                          const branches = [
                            ...((config.branches as Array<{ expression: string }>) ?? []),
                          ];
                          branches.splice(idx, 1);
                          onUpdate(node.id, { ...config, branches });
                        }}
                        className="ml-auto p-0.5 rounded hover:bg-surface-300 text-foreground-muted"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={branch.expression}
                    onChange={(e) => {
                      const branches = [
                        ...((config.branches as Array<{ expression: string }>) ?? []),
                      ];
                      branches[idx] = { ...branches[idx], expression: e.target.value };
                      onUpdate(node.id, { ...config, branches });
                    }}
                    placeholder='<starter_1.output.status> == "approved"'
                    className="w-full text-xs px-2 py-1.5 rounded border border-muted bg-surface-200 text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
              )
            )}
            <button
              onClick={() => {
                const branches = [
                  ...((config.branches as Array<{ expression: string }>) ?? []),
                  { expression: "" },
                ];
                onUpdate(node.id, { ...config, branches });
              }}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-600 mt-1"
            >
              <Plus className="h-3 w-3" />
              Add else-if
            </button>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-xs font-medium text-orange-400">Else</span>
              <span className="text-[10px] text-foreground-muted">(implicit fallback)</span>
            </div>
          </div>
        )}

        {basicBlocks.map((sb, idx) => (
          <div key={sb.id}>
            {idx > 0 && (
              <div className="h-px my-3" style={DASHED_DIVIDER_STYLE} />
            )}
            {renderSubBlock(sb)}
          </div>
        ))}

        {/* Advanced toggle */}
        {advancedBlocks.length > 0 && (
          <>
            <button
              onClick={() => setAdvancedOpen((prev) => !prev)}
              className="flex items-center gap-2 w-full my-3 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              <div className="flex-1 h-px" style={DASHED_DIVIDER_STYLE} />
              <span className="flex items-center gap-1 whitespace-nowrap">
                {advancedOpen ? "Hide" : "Show"} additional fields
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    advancedOpen && "rotate-180",
                  )}
                />
              </span>
              <div className="flex-1 h-px" style={DASHED_DIVIDER_STYLE} />
            </button>

            {advancedOpen &&
              advancedBlocks.map((sb, idx) => (
                <div key={sb.id}>
                  {idx > 0 && (
                    <div className="h-px my-3" style={DASHED_DIVIDER_STYLE} />
                  )}
                  {renderSubBlock(sb)}
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
