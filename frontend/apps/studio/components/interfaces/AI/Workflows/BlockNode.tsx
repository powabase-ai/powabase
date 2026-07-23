

import { useState, useEffect, useLayoutEffect, Fragment, useRef } from "react";
import { Handle, Position, type NodeProps, useReactFlow, useUpdateNodeInternals } from "reactflow";
import {
  Play,
  Split,
  Layers,
  Webhook,
  Network,
  HelpCircle,
  Plus,
  Minus,
} from "lucide-react";
import {
  PaperPlaneIcon,
  CodeBranchIcon,
  RobotIcon,
  CodeIcon,
  GlobeIcon,
} from "./BlockIcons";
import { blockRegistry, type SubBlockConfig, type InputMapping } from "@/data/ai-workflows/block-registry";
import { evaluateCondition } from "./condition-utils";
import { useWorkflowState } from "./WorkflowContext";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { agentsApi, hasAiAuth, knowledgeBasesApi } from "@/lib/ai-api";

// Backend page size ceiling (list endpoints clamp limit to [1, 100]).
// See kb-tab.tsx for the same tradeoff on the "assign KB" picker.
const MAX_KBS_FOR_PICKER = 100;

const iconMap: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Play,
  // Filled Font Awesome replacements — see BlockIcons.tsx. Keys match the
  // legacy registry strings so block-registry.ts needs no changes.
  Bot: RobotIcon,
  Code: CodeIcon,
  GitBranch: CodeBranchIcon,
  Split,
  Globe: GlobeIcon,
  Layers,
  MessageSquare: PaperPlaneIcon,
  Webhook,
  Network,
};

// Arbitrary-hex values are used for amber/violet/orange/indigo/blue because
// this app's tailwind config remaps those color names onto Radix Colors (see
// frontend/packages/config/ui.config.js), where `-500` resolves to step 5 —
// a pale interactive-background tint, not Tailwind's saturated mid-tone.
// The hex values below are Tailwind's canonical default palette.
const topBarColorMap: Record<string, string> = {
  emerald: "bg-emerald-500",
  violet: "bg-[#8b5cf6]",
  amber: "bg-[#f59e0b]",
  orange: "bg-[#f97316]",
  blue: "bg-[#3b82f6]",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  sky: "bg-sky-500",
  indigo: "bg-[#6366f1]",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
};

const iconColorMap: Record<string, string> = {
  emerald: "text-emerald-300",
  violet: "text-[#c4b5fd]",
  amber: "text-[#fcd34d]",
  orange: "text-[#fdba74]",
  blue: "text-[#93c5fd]",
  teal: "text-teal-300",
  cyan: "text-cyan-300",
  sky: "text-sky-300",
  indigo: "text-[#a5b4fc]",
  rose: "text-rose-300",
  slate: "text-slate-200",
};

function formatConfigValue(value: unknown, sb: SubBlockConfig): string {
  if (value == null || value === "") return "\u2014";

  switch (sb.type) {
    case "dropdown":
    case "combobox":
      return sb.options?.find((o) => o.value === value)?.label ?? String(value);
    case "slider":
      return typeof value === "number" ? value.toFixed(1) : "\u2014";
    case "switch":
      return value ? "On" : "Off";
    case "agent-select":
      return value ? "Selected" : "None";
    case "kb-select":
      return Array.isArray(value) && value.length > 0
        ? `${value.length} selected`
        : "None";
    case "table": {
      const rows = Array.isArray(value)
        ? value.filter((r) =>
            Object.values((r as Record<string, Record<string, string>>)?.cells ?? {}).some((v) => v)
          )
        : [];
      return rows.length > 0
        ? `${rows.length} row${rows.length > 1 ? "s" : ""}`
        : "\u2014";
    }
    case "json-kv": {
      let obj = value;
      if (typeof obj === "string") {
        try { obj = JSON.parse(obj); } catch { return "\u2014"; }
      }
      if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        const keys = Object.keys(obj as Record<string, unknown>);
        if (keys.length === 0) return "\u2014";
        const joined = keys.join(", ");
        return joined.length > 22 ? joined.slice(0, 20) + "\u2026" : joined;
      }
      return "\u2014";
    }
    case "checkbox-group":
      return Array.isArray(value) && value.length > 0
        ? `${value.length} selected`
        : "None";
    case "code":
      return value ? "\u2714 defined" : "\u2014";
    default: {
      if (typeof value === "object") {
        const j = JSON.stringify(value);
        return j.length > 20 ? j.slice(0, 20) + "\u2026" : j;
      }
      const s = String(value);
      return s.length > 22 ? s.slice(0, 20) + "\u2026" : s;
    }
  }
}

function AgentNameLabel({ agentId }: { agentId: string }) {
  const { token, ref } = useProjectSupabaseClient();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId || !hasAiAuth(token)) { setName(null); return; }
    let cancelled = false;
    agentsApi.get(token, ref, agentId)
      .then((data) => {
        if (cancelled) return;
        setName(data.name);
      })
      .catch(() => {
        if (!cancelled) setName(null);
      });
    return () => { cancelled = true; };
  }, [agentId, token, ref]);

  if (!agentId) return <>None</>;
  return <>{name ?? "…"}</>;
}

function KBNamesLabel({ value }: { value: unknown }) {
  const { token, ref } = useProjectSupabaseClient();
  const [names, setNames] = useState<string[] | null>(null);

  const ids = Array.isArray(value) ? value.map((v: { id: string }) => v.id) : [];

  useEffect(() => {
    if (ids.length === 0 || !hasAiAuth(token)) { setNames(null); return; }
    let cancelled = false;
    knowledgeBasesApi.list(token, ref, { limit: MAX_KBS_FOR_PICKER })
      .then((res) => {
        if (cancelled) return;
        const kbMap = new Map(res.items.map((kb) => [kb.id, kb.name]));
        setNames(ids.map((id) => kbMap.get(id) ?? id));
      })
      .catch(() => {
        if (!cancelled) setNames(null);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ids), token, ref]);

  if (ids.length === 0) return <>None</>;
  if (!names) return <>…</>;
  const joined = names.join(", ");
  return <>{joined.length > 22 ? joined.slice(0, 20) + "…" : joined}</>;
}

function MappedInputLabel({ mapping }: { mapping: InputMapping }) {
  const { getNodes } = useReactFlow();
  const nodes = getNodes();
  const sourceNode = nodes.find((n) => n.id === mapping.sourceId);
  const sourceName = sourceNode?.data?.label || mapping.sourceId;
  const label = `← ${sourceName}.${mapping.outputField}`;
  return <>{label.length > 22 ? label.slice(0, 20) + "…" : label}</>;
}

function ConfigValue({
  value,
  subBlock,
  config,
}: {
  value: unknown;
  subBlock: SubBlockConfig;
  config: Record<string, unknown>;
}) {
  if (subBlock.type === "agent-select") {
    return <AgentNameLabel agentId={value as string} />;
  }

  if (subBlock.type === "kb-select") {
    return <KBNamesLabel value={value} />;
  }

  if (subBlock.type === "long-input" || subBlock.type === "short-input") {
    const mappings = config?._inputMappings as InputMapping[] | undefined;
    const mapping = mappings?.find((m) => m.targetField === subBlock.id);
    if (mapping) {
      return <MappedInputLabel mapping={mapping} />;
    }
  }

  return <>{formatConfigValue(value, subBlock)}</>;
}

interface BlockNodeData {
  blockType: string;
  label: string;
  config: Record<string, unknown>;
}

function BlockNodeComponent({ id, data, selected }: NodeProps<BlockNodeData>) {
  const { setEdges, updateNodeConfigAndRefresh } = useWorkflowState();

  const typeConfig = blockRegistry[data.blockType];
  const iconName = typeConfig?.icon ?? "HelpCircle";
  const color = typeConfig?.color ?? "slate";
  const Icon = iconMap[iconName] ?? HelpCircle;
  const hasInput = typeConfig?.hasInput ?? true;
  const hasOutput = typeConfig?.hasOutput ?? true;

  // Dynamic output handles for split and condition blocks; static for others
  const outputHandles = (() => {
    if (data.blockType === "split") {
      return Array.from(
        { length: (data.config?.branches as number) || 2 },
        (_, i) => String(i + 1)
      );
    }
    if (data.blockType === "condition") {
      const branches = (data.config?.branches as Array<{ expression: string }>) ?? [];
      const handles = branches.map((_, i) => (i === 0 ? "if" : `elif_${i}`));
      return [...handles, "else"];
    }
    return typeConfig?.outputHandles;
  })();

  const outputHandlesKey = outputHandles?.join(",") ?? "";

  const updateNodeInternals = useUpdateNodeInternals();
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (data.blockType !== "split" && data.blockType !== "condition") return;
    if (!nodeRef.current) return;

    const el = nodeRef.current;

    const run = () => {
      updateNodeInternals(id);
      setEdges((edges) =>
        edges.map((e) =>
          e.source === id || e.target === id ? { ...e } : e
        )
      );
    };

    const ro = new ResizeObserver(() => {
      run();
    });

    ro.observe(el);

    run();
    const raf1 = requestAnimationFrame(run);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(run));

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [id, data.blockType, outputHandlesKey, selected, updateNodeInternals, setEdges]);

  const visibleSubBlocks = typeConfig?.subBlocks.filter(
    (sb) =>
      sb.mode !== "advanced" &&
      evaluateCondition(sb.condition, data.config ?? {})
  );

  return (
    <div
      key={`${id}:${(data as any).layoutVersion ?? outputHandlesKey}`}
      ref={nodeRef}
      className={`
        relative overflow-visible
        rounded-lg border border-default bg-surface-100
        w-[220px] shadow-sm
        ${selected ? "ring-2 ring-brand-400 border-brand-400" : ""}
      `}
    >
      {/* Colored top accent bar */}
      <div className={`h-[5px] rounded-t-[7px] ${topBarColorMap[color] ?? topBarColorMap.slate}`} />

      {/* Input handle */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Top}
        />
      )}

      <div className="px-3 py-2.5">
        {/* Header: icon + label */}
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${iconColorMap[color] ?? "text-slate-200"}`} />
          <span className="text-sm font-medium text-foreground truncate">
            {data.label || typeConfig?.name || data.blockType}
          </span>
        </div>

        {/* Config fields (non-advanced only) */}
        {visibleSubBlocks && visibleSubBlocks.length > 0 && (
          <div className="mt-1.5">
            {visibleSubBlocks.map((sb) => (
              <div
                key={sb.id}
                className="flex items-center justify-between gap-2 mt-1 first:mt-0"
              >
                <span className="text-xs text-foreground-muted truncate">
                  {sb.title}
                </span>
                <span className="text-xs text-foreground truncate max-w-[120px] text-right font-medium">
                  <ConfigValue value={data.config?.[sb.id]} subBlock={sb} config={data.config ?? {}} />
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Condition branch expression previews */}
        {data.blockType === "condition" && (
          <div className="mt-1.5">
            {((data.config?.branches as Array<{ expression: string }>) ?? []).map((b, i) => {
              const label = i === 0 ? "if" : `elif ${i}`;
              const expr = b.expression || "\u2014";
              const truncated = expr.length > 20 ? expr.slice(0, 18) + "\u2026" : expr;
              return (
                <div key={i} className="flex items-center gap-1.5 mt-0.5 first:mt-0">
                  <span className="text-[10px] font-medium text-orange-400 shrink-0">{label}:</span>
                  <span className="text-[10px] text-foreground-muted truncate">{truncated}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-medium text-orange-400">else</span>
            </div>
          </div>
        )}

        {/* Condition branch +/- controls */}
        {data.blockType === "condition" && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <button
              className="w-5 h-5 flex items-center justify-center rounded bg-surface-200 hover:bg-surface-300 text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                const branches = (data.config?.branches as Array<{ expression: string }>) ?? [];
                if (branches.length <= 1) return;
                const next = branches.slice(0, -1);
                updateNodeConfigAndRefresh(id, (prev) => ({ ...prev, branches: next }));
              }}
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-xs text-foreground-muted">
              {((data.config?.branches as Array<{ expression: string }>) ?? []).length} + else
            </span>
            <button
              className="w-5 h-5 flex items-center justify-center rounded bg-surface-200 hover:bg-surface-300 text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                const branches = (data.config?.branches as Array<{ expression: string }>) ?? [];
                if (branches.length >= 9) return;
                const next = [...branches, { expression: "" }];
                updateNodeConfigAndRefresh(id, (prev) => ({ ...prev, branches: next }));
              }}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Split branch controls */}
        {data.blockType === "split" && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <button
              className="w-5 h-5 flex items-center justify-center rounded bg-surface-200 hover:bg-surface-300 text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                const current = (data.config?.branches as number) || 2;
                if (current <= 2) return;
                updateNodeConfigAndRefresh(id, (prev) => ({ ...prev, branches: current - 1 }));
              }}
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-xs text-foreground-muted">
              {(data.config?.branches as number) || 2} branches
            </span>
            <button
              className="w-5 h-5 flex items-center justify-center rounded bg-surface-200 hover:bg-surface-300 text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                const current = (data.config?.branches as number) || 2;
                if (current >= 10) return;
                updateNodeConfigAndRefresh(id, (prev) => ({ ...prev, branches: current + 1 }));
              }}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Output handles */}
      {hasOutput && !outputHandles && (
        <Handle
          type="source"
          position={Position.Bottom}
        />
      )}

      {/* Named output handles (e.g. condition if/elif/else) */}
      {outputHandles &&
        outputHandles.map((handle, i) => {
          const leftPct = `${((i + 1) / (outputHandles.length + 1)) * 100}%`;
          return (
            <Fragment key={handle}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={handle}
                style={{ left: leftPct }}
              />
              <div
                className="pointer-events-none absolute text-[10px] text-foreground-muted whitespace-nowrap"
                style={{
                  left: leftPct,
                  bottom: -22,
                  transform: "translateX(-50%)",
                }}
              >
                {handle.replace("_", " ")}
              </div>
            </Fragment>
          );
        })}
    </div>
  );
}

export const BlockNode = BlockNodeComponent;
