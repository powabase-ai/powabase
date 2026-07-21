

import { useEffect, useRef, useState } from "react";
import { HelpCircle, Trash2, Copy, Check, Plus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Label_Shadcn_ as Label,
  Button_Shadcn_ as Button,
  Checkbox_Shadcn_ as Checkbox,
  Switch,
  Popover_Shadcn_ as Popover,
  PopoverContent_Shadcn_ as PopoverContent,
  PopoverTrigger_Shadcn_ as PopoverTrigger,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  Select_Shadcn_ as Select,
  SelectContent_Shadcn_ as SelectContent,
  SelectItem_Shadcn_ as SelectItem,
  SelectTrigger_Shadcn_ as SelectTrigger,
  SelectValue_Shadcn_ as SelectValue,
} from "ui";
import { projectApi, agentKBApi, hasAiAuth, orchestrationsApi, type AgentKBAssignment, type Orchestration, type OrchestrationEntity } from "@/lib/ai-api";
import { useConnectionInfoQuery } from "@/data/project-connection/connection-query";
import type { Agent, KnowledgeBase } from "@/hooks/ai/useProjectSupabaseClient";
import type { SubBlockConfig } from "@/data/ai-workflows/block-registry";
import { ModelSelector } from "@/components/interfaces/AI/Agents/ModelSelector";
import Link from "next/link";

function SubBlockHelpDialog({
  title,
  sections,
}: {
  title: string;
  sections: NonNullable<SubBlockConfig["helpSections"]>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-foreground-muted hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="text-sm">{title} Reference</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {sections.map((section, i) => (
            <div key={i} className="space-y-1.5">
              {section.title && (
                <p className="text-xs font-medium text-foreground">
                  {section.title}
                </p>
              )}
              {section.format === "code" ? (
                <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground-muted bg-surface-200 rounded p-2.5 leading-relaxed">
                  {section.body}
                </pre>
              ) : section.format === "pills" ? (
                <div className="flex flex-wrap gap-1.5">
                  {section.body.split(",").map((item) => (
                    <span
                      key={item.trim()}
                      className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-mono bg-surface-200 text-foreground"
                    >
                      {item.trim()}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-foreground-muted leading-relaxed">
                  {section.body}
                </p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Checkbox Group (for import picker, etc.) ────────────────────────────────

function CheckboxGroupInput({
  items,
  value,
  onChange,
}: {
  items: NonNullable<SubBlockConfig["checkboxItems"]>;
  value: string[];
  onChange: (v: unknown) => void;
}) {
  const selected = new Set(value);
  const toggle = (key: string) => {
    onChange(
      selected.has(key) ? value.filter((k) => k !== key) : [...value, key],
    );
  };
  const stdlibItems = items.filter((i) => i.tag === "stdlib");
  const otherItems = items.filter((i) => i.tag !== "stdlib");

  const renderItem = (item: (typeof items)[0]) => (
    <label key={item.key} className="flex items-center gap-2 cursor-pointer">
      <Checkbox
        checked={selected.has(item.key)}
        onCheckedChange={() => toggle(item.key)}
      />
      <span className="font-mono text-xs text-foreground">
        {item.label}
      </span>
      {item.alias && (
        <span className="text-[10px] text-foreground-muted">
          as {item.alias}
        </span>
      )}
      {item.tag === "network" && (
        <span className="text-[10px] text-amber-300">(network)</span>
      )}
    </label>
  );

  return (
    <div className="space-y-2 rounded border border-default p-2 max-h-44 overflow-y-auto">
      {stdlibItems.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
            Standard Library
          </span>
          <div className="grid grid-cols-2 gap-1">{stdlibItems.map(renderItem)}</div>
        </div>
      )}
      {otherItems.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
            Packages
          </span>
          <div className="grid grid-cols-2 gap-1">{otherItems.map(renderItem)}</div>
        </div>
      )}
    </div>
  );
}

interface SubBlockRendererProps {
  subBlock: SubBlockConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  token?: string;
  projectRef?: string;
  /** Full block config — needed for webhook blocks to compute URL */
  blockConfig?: Record<string, unknown>;
}

export function SubBlockRenderer({
  subBlock,
  value,
  onChange,
  token,
  projectRef,
  blockConfig,
}: SubBlockRendererProps) {
  const strVal = (value ?? "") as string;

  // Webhook read-only fields
  if (subBlock.id === "webhook_url" || subBlock.id === "webhook_secret") {
    return (
      <WebhookReadOnlyField
        subBlock={subBlock}
        blockConfig={blockConfig}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-foreground-muted">
          {subBlock.title}
          {subBlock.required && <span className="text-red-300 ml-0.5">*</span>}
        </Label>
        {subBlock.helpSections ? (
          <SubBlockHelpDialog title={subBlock.title} sections={subBlock.helpSections} />
        ) : subBlock.example ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-foreground-muted hover:text-foreground"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" className="w-72">
              <p className="text-xs font-medium mb-1.5">Example</p>
              <pre className="text-xs whitespace-pre-wrap break-words text-foreground-muted bg-surface-200 rounded p-2">
                {subBlock.example}
              </pre>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      {subBlock.description && (
        <p className="text-[11px] leading-snug text-foreground-muted">
          {subBlock.description}
        </p>
      )}
      {renderInput(subBlock, value, strVal, onChange, token, projectRef)}
    </div>
  );
}

// ─── Webhook Read-Only Field ─────────────────────────────────────────────────

function WebhookReadOnlyField({
  subBlock,
  blockConfig,
}: {
  subBlock: SubBlockConfig;
  blockConfig?: Record<string, unknown>;
}) {
  const [copied, setCopied] = useState(false);
  const { data: connectionInfo } = useConnectionInfoQuery();
  const kongUrl = connectionInfo?.api_url ?? "";

  const displayValue =
    subBlock.id === "webhook_url"
      ? blockConfig?.webhook_id
        ? `${kongUrl}/api/webhooks/${blockConfig.webhook_id}`
        : "Save workflow to generate URL"
      : (blockConfig?.webhook_secret as string) || "Not generated";

  const handleCopy = () => {
    if (!displayValue || displayValue.startsWith("Save") || displayValue === "Not generated") return;
    navigator.clipboard.writeText(displayValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-foreground-muted">
        {subBlock.title}
      </Label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          readOnly
          className="flex-1 h-8 px-2 text-xs font-mono rounded border border-default bg-surface-200 text-foreground-muted cursor-default"
          value={displayValue}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-foreground-muted hover:text-foreground"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function renderInput(
  sb: SubBlockConfig,
  value: unknown,
  strVal: string,
  onChange: (v: unknown) => void,
  token?: string,
  projectRef?: string,
) {
  switch (sb.type) {
    case "short-input":
      return (
        <input
          type="text"
          className="w-full h-8 px-2 text-sm rounded border border-default bg-surface-100 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
          placeholder={sb.placeholder}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "long-input":
      return (
        <textarea
          className="w-full px-2 py-1.5 text-sm rounded border border-default bg-surface-100 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y"
          rows={sb.rows ?? 3}
          placeholder={sb.placeholder}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "code":
      return (
        <textarea
          className="w-full px-2 py-1.5 text-xs font-mono rounded border border-default bg-surface-200 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
          rows={sb.rows ?? 6}
          placeholder={sb.placeholder}
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "dropdown":
      return (
        <Select value={strVal} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={sb.placeholder ?? "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {(sb.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "switch":
      return (
        <Switch
          checked={!!value}
          onCheckedChange={(checked) => onChange(checked)}
        />
      );

    case "agent-select":
      return (
        <AgentSelectInput
          value={strVal}
          onChange={onChange}
          token={token}
          projectRef={projectRef}
        />
      );

    case "orchestration-select":
      return (
        <OrchestrationSelectInput
          value={strVal}
          onChange={onChange}
          token={token}
          projectRef={projectRef}
        />
      );

    case "kb-select":
      return (
        <KBSelectInput
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          token={token}
          projectRef={projectRef}
        />
      );

    case "slider": {
      const numVal = typeof value === "number" ? value : (sb.min ?? 0);
      const min = sb.min ?? 0;
      const max = sb.max ?? 1;
      const step = sb.step ?? 0.1;
      const pct = ((numVal - min) / (max - min)) * 100;
      return (
        <div className="space-y-1">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={numVal}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full accent-[hsl(var(--brand-default))]"
          />
          <div className="relative h-4">
            <span
              className="absolute text-[10px] text-foreground-muted -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {numVal.toFixed(1)}
            </span>
          </div>
        </div>
      );
    }

    case "checkbox-group":
      return (
        <CheckboxGroupInput
          items={sb.checkboxItems ?? []}
          value={(value as string[]) ?? sb.defaultValue ?? []}
          onChange={onChange}
        />
      );

    case "table":
      return (
        <TableInput
          columns={sb.columns ?? ["Key", "Value"]}
          value={value as Array<{ cells: Record<string, string> }> ?? []}
          onChange={onChange}
        />
      );

    case "json-kv":
      return (
        <JsonKvInput
          value={value}
          onChange={onChange}
        />
      );

    case "model-selector":
      return (
        <ModelSelector
          value={strVal}
          onChange={(v) => onChange(v)}
          placeholder={sb.placeholder}
          allowEmpty
        />
      );

    case "combobox":
      return (
        <ComboboxInput
          options={sb.options ?? []}
          value={strVal}
          onChange={onChange}
          placeholder={sb.placeholder}
        />
      );

    default:
      return (
        <input
          type="text"
          className="w-full h-8 px-2 text-sm rounded border border-default bg-surface-100"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

// ─── Picker Fetch Error ─────────────────────────────────────────────────────
// Shared by the Agent/Orchestration/KB pickers below: a transient proxy
// error (e.g. self-host project-api 5xx) must render distinguishably from
// "this project genuinely has none yet" — an empty dropdown alone is
// ambiguous between the two.

function PickerFetchError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-destructive-600 bg-destructive-200 border border-destructive-300 rounded px-2 py-1">
      <span className="truncate">{message}</span>
      <button type="button" onClick={onRetry} className="shrink-0 underline hover:no-underline">
        Retry
      </button>
    </div>
  );
}

// ─── Agent Select ───────────────────────────────────────────────────────────

function AgentSelectInput({
  value,
  onChange,
  token,
  projectRef,
}: {
  value: string;
  onChange: (v: unknown) => void;
  token?: string;
  projectRef?: string;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [agentKBs, setAgentKBs] = useState<AgentKBAssignment[]>([]);
  const [kbError, setKbError] = useState<string | null>(null);
  const [kbRetryKey, setKbRetryKey] = useState(0);

  useEffect(() => {
    if (!hasAiAuth(token) || !projectRef) return;
    setLoading(true);
    setError(null);
    // Self-host: token is legitimately '' | undefined here — hasAiAuth (not a
    // type predicate) already proved that's OK; the proxy injects the real
    // credential regardless.
    projectApi<{ agents: Agent[] }>(token!, projectRef, "/agents")
      .then((res) => setAgents(res.agents ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load agents"))
      .finally(() => setLoading(false));
  }, [token, projectRef, retryKey]);

  // Fetch KBs for the selected agent
  useEffect(() => {
    if (!hasAiAuth(token) || !projectRef || !value) {
      setAgentKBs([]);
      setKbError(null);
      return;
    }
    setKbError(null);
    agentKBApi
      .list(token!, projectRef, value)
      .then((res) => setAgentKBs(res.knowledge_bases ?? []))
      .catch((err) => {
        setAgentKBs([]);
        setKbError(err instanceof Error ? err.message : "Failed to load knowledge bases");
      });
  }, [token, projectRef, value, kbRetryKey]);

  const selected = agents.find((a) => a.id === value);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Select
          value={value || undefined}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-8 text-sm flex-1">
            <SelectValue placeholder={loading ? "Loading..." : "Select an agent"} />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && projectRef && (
          <Link
            href={`/project/${projectRef}/agents/${value}`}
            target="_blank"
            className="shrink-0 p-1.5 rounded text-foreground-muted hover:text-foreground hover:bg-surface-200 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {error && (
        <PickerFetchError
          message={`Failed to load agents: ${error}`}
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      )}
      {selected && (
        <div className="text-xs text-foreground-muted bg-surface-200 rounded p-2 space-y-0.5">
          <div>Model: {selected.model}</div>
          {selected.system_prompt && (
            <div className="truncate">Prompt: {selected.system_prompt.slice(0, 80)}...</div>
          )}
          {kbError ? (
            <PickerFetchError
              message={`Failed to load knowledge bases: ${kbError}`}
              onRetry={() => setKbRetryKey((k) => k + 1)}
            />
          ) : (
            agentKBs.length > 0 && (
              <div className="truncate">
                Knowledge Bases: {agentKBs.map((kb) => kb.knowledge_base?.name ?? kb.knowledge_base_id).join(", ")}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Orchestration Select ────────────────────────────────────────────────────

function OrchestrationSelectInput({
  value,
  onChange,
  token,
  projectRef,
}: {
  value: string;
  onChange: (v: unknown) => void;
  token?: string;
  projectRef?: string;
}) {
  const [orchestrations, setOrchestrations] = useState<Orchestration[]>([]);
  const [entities, setEntities] = useState<OrchestrationEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [entitiesRetryKey, setEntitiesRetryKey] = useState(0);

  useEffect(() => {
    if (!hasAiAuth(token) || !projectRef) return;
    setLoading(true);
    setError(null);
    // Self-host: token is legitimately '' | undefined here — hasAiAuth (not a
    // type predicate) already proved that's OK; the proxy injects the real
    // credential regardless.
    orchestrationsApi
      .list(token!, projectRef)
      .then((res) => setOrchestrations(res.items ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load orchestrations"))
      .finally(() => setLoading(false));
  }, [token, projectRef, retryKey]);

  // Fetch entities for the selected orchestration
  useEffect(() => {
    if (!hasAiAuth(token) || !projectRef || !value) {
      setEntities([]);
      setEntitiesError(null);
      return;
    }
    setEntitiesError(null);
    orchestrationsApi
      .listEntities(token!, projectRef, value)
      .then((res) => setEntities(res.entities ?? []))
      .catch((err) => {
        setEntities([]);
        setEntitiesError(err instanceof Error ? err.message : "Failed to load agents for this orchestration");
      });
  }, [token, projectRef, value, entitiesRetryKey]);

  const selected = orchestrations.find((o) => o.id === value);

  const strategyLabel: Record<string, string> = {
    supervisor: "Supervisor",
    sequential: "Sequential",
    parallel: "Parallel",
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Select
          value={value || undefined}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-8 text-sm flex-1">
            <SelectValue placeholder={loading ? "Loading..." : "Select an orchestration"} />
          </SelectTrigger>
          <SelectContent>
            {orchestrations.map((orch) => (
              <SelectItem key={orch.id} value={orch.id}>
                {orch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && projectRef && (
          <Link
            href={`/project/${projectRef}/orchestrations/${value}`}
            target="_blank"
            className="shrink-0 p-1.5 rounded text-foreground-muted hover:text-foreground hover:bg-surface-200 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {error && (
        <PickerFetchError
          message={`Failed to load orchestrations: ${error}`}
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      )}
      {selected && (
        <div className="text-xs text-foreground-muted bg-surface-200 rounded p-2 space-y-1">
          <div>Strategy: {strategyLabel[selected.strategy] ?? selected.strategy}</div>
          {selected.description && (
            <div className="truncate">{selected.description}</div>
          )}
          {entitiesError ? (
            <PickerFetchError
              message={`Failed to load agents: ${entitiesError}`}
              onRetry={() => setEntitiesRetryKey((k) => k + 1)}
            />
          ) : (
            entities.length > 0 && (
              <div className="space-y-0.5">
                <div className="font-medium">Agents ({entities.filter((e) => e.entity_type === "agent").length}):</div>
                {entities
                  .filter((e) => e.entity_type === "agent")
                  .map((entity) => (
                    <div key={entity.id} className="pl-2 truncate">
                      {entity.agent_name ?? "Agent"}{entity.role_description ? ` — ${entity.role_description}` : ""}
                    </div>
                  ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Table Input ────────────────────────────────────────────────────────────

function TableInput({
  columns,
  value,
  onChange,
}: {
  columns: string[];
  value: Array<{ cells: Record<string, string> }>;
  onChange: (v: unknown) => void;
}) {
  const rows = (value ?? []).length > 0 ? value : [{ cells: Object.fromEntries(columns.map((c) => [c, ""])) }];

  const updateCell = (rowIdx: number, col: string, val: string) => {
    const next = rows.map((r, i) =>
      i === rowIdx ? { cells: { ...r.cells, [col]: val } } : r
    );
    onChange(next);
  };

  const deleteRow = (rowIdx: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== rowIdx));
  };

  return (
    <div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="text-left text-[10px] font-medium text-foreground-muted px-1 pb-1"
              >
                {col}
              </th>
            ))}
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="group">
              {columns.map((col) => (
                <td key={col} className="p-0.5">
                  <input
                    type="text"
                    className="w-full h-7 px-1.5 text-xs rounded border border-default bg-surface-100 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
                    value={row.cells?.[col] ?? ""}
                    onChange={(e) => updateCell(rowIdx, col, e.target.value)}
                    placeholder={col}
                  />
                </td>
              ))}
              <td className="p-0.5 text-center">
                <button
                  onClick={() => deleteRow(rowIdx)}
                  className="opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-destructive-600 transition-opacity"
                  disabled={rows.length <= 1}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() =>
          onChange([...rows, { cells: Object.fromEntries(columns.map((c) => [c, ""])) }])
        }
        className="mt-1 flex items-center gap-1 text-[10px] text-foreground-muted hover:text-foreground transition-colors"
      >
        <Plus className="h-3 w-3" /> Add row
      </button>
    </div>
  );
}

// ─── Combobox Input ─────────────────────────────────────────────────────────

function ComboboxInput({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (v: unknown) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputValue = value;
  const displayLabel = options.find((o) => o.value === value)?.label;

  const filtered = options.filter((o) => {
    const q = (filter || inputValue).toLowerCase();
    return !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q);
  });

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full h-8 px-2 text-sm rounded border border-default bg-surface-100 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
        placeholder={placeholder}
        value={filter || displayLabel || inputValue}
        onChange={(e) => {
          setFilter(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setFilter("");
          setOpen(true);
        }}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 border border-default bg-surface-100 rounded shadow-md max-h-48 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt.value}
              className={cn(
                "w-full text-left px-2 py-1.5 text-sm hover:bg-surface-200 transition-colors",
                opt.value === value && "bg-surface-200"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(opt.value);
                setFilter("");
                setOpen(false);
                if (blurTimeout.current) clearTimeout(blurTimeout.current);
              }}
            >
              <span className="text-foreground">{opt.label}</span>
              <span className="ml-2 text-[10px] text-foreground-muted">{opt.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── JSON Key-Value Input ────────────────────────────────────────────────────

function parseKvValue(value: unknown): Array<[string, string]> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => [k, String(v ?? "")] as [string, string]
    );
    return [...entries, ["", ""]];
  }
  // Backward compat: try parsing JSON string
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed).map(
          ([k, v]) => [k, String(v ?? "")] as [string, string]
        );
        return [...entries, ["", ""]];
      }
    } catch {
      // Not valid JSON
    }
  }
  return [["", ""]];
}

function JsonKvInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const rows = parseKvValue(value);

  const emitChange = (updated: Array<[string, string]>) => {
    const record: Record<string, string> = {};
    for (const [k, v] of updated) {
      if (k.trim()) record[k.trim()] = v;
    }
    onChange(record);
  };

  const updateRow = (idx: number, col: 0 | 1, val: string) => {
    const next = rows.map((r, i) => (i === idx ? ([col === 0 ? val : r[0], col === 1 ? val : r[1]] as [string, string]) : r));
    // Auto-add empty row when typing in last row
    if (idx === next.length - 1 && val) {
      next.push(["", ""]);
    }
    emitChange(next);
  };

  const deleteRow = (idx: number) => {
    if (rows.length <= 1) {
      emitChange([["", ""]]);
      return;
    }
    emitChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>
          <th className="text-left text-[10px] font-medium text-foreground-muted px-1 pb-1">
            Variable
          </th>
          <th className="text-left text-[10px] font-medium text-foreground-muted px-1 pb-1">
            Default Value
          </th>
          <th className="w-6" />
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, val], idx) => (
          <tr key={idx} className="group">
            <td className="p-0.5">
              <input
                type="text"
                className="w-full h-7 px-1.5 text-xs rounded border border-default bg-surface-100 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
                value={key}
                onChange={(e) => updateRow(idx, 0, e.target.value)}
                placeholder="key"
              />
            </td>
            <td className="p-0.5">
              <input
                type="text"
                className="w-full h-7 px-1.5 text-xs rounded border border-default bg-surface-100 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
                value={val}
                onChange={(e) => updateRow(idx, 1, e.target.value)}
                placeholder="default value"
              />
            </td>
            <td className="p-0.5 text-center">
              <button
                onClick={() => deleteRow(idx)}
                className="opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-destructive-600 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── KB Checkbox Select ─────────────────────────────────────────────────────

function KBSelectInput({
  value,
  onChange,
  token,
  projectRef,
}: {
  value: Array<{ id: string }>;
  onChange: (v: unknown) => void;
  token?: string;
  projectRef?: string;
}) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!hasAiAuth(token) || !projectRef) return;
    setLoading(true);
    setError(null);
    // Self-host: token is legitimately '' | undefined here — hasAiAuth (not a
    // type predicate) already proved that's OK; the proxy injects the real
    // credential regardless.
    projectApi<{ knowledge_bases: KnowledgeBase[] }>(
      token!,
      projectRef,
      "/knowledge-bases",
    )
      .then((res) => setKbs(res.knowledge_bases ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load knowledge bases"))
      .finally(() => setLoading(false));
  }, [token, projectRef, retryKey]);

  const selectedIds = new Set(value.map((v) => v.id));

  function toggle(kbId: string) {
    if (selectedIds.has(kbId)) {
      onChange(value.filter((v) => v.id !== kbId));
    } else {
      onChange([...value, { id: kbId }]);
    }
  }

  if (loading) {
    return <div className="text-xs text-foreground-muted">Loading knowledge bases...</div>;
  }

  if (error) {
    return (
      <PickerFetchError
        message={`Failed to load knowledge bases: ${error}`}
        onRetry={() => setRetryKey((k) => k + 1)}
      />
    );
  }

  if (kbs.length === 0) {
    return <div className="text-xs text-foreground-muted">No knowledge bases found</div>;
  }

  return (
    <div className="max-h-32 overflow-y-auto space-y-1.5 rounded border border-default p-2">
      {kbs.map((kb) => (
        <label
          key={kb.id}
          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface-200 rounded px-1"
        >
          <Checkbox
            checked={selectedIds.has(kb.id)}
            onCheckedChange={() => toggle(kb.id)}
          />
          <span className="truncate text-foreground">{kb.name}</span>
        </label>
      ))}
    </div>
  );
}
