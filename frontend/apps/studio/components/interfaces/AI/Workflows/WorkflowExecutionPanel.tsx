

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { blockRegistry } from "@/data/ai-workflows/block-registry";
import {
  useWorkflowExecutionsQuery,
  useExecutionBlockLogsQuery,
} from "@/data/ai-workflows";
import type { WorkflowExecution } from "@/lib/ai-api";
import { runsApi, truncateRunId, type AgentRunDetail } from "@/lib/ai-api/runs-api";
import { hasAiAuth } from "@/lib/ai-api";
import { useParams } from "common";
import { useSessionAccessTokenQuery } from "@/data/auth/session-access-token-query";

// Arbitrary-hex values for amber/violet/orange/indigo/blue — see BlockNode.tsx
// for the Radix-remap rationale.
const dotColorMap: Record<string, string> = {
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
  slate: "bg-slate-400",
};

// Re-export the local BlockLog shape used by the current-run result
interface LocalBlockLog {
  block_id: string;
  block_type: string;
  block_name: string;
  status: "success" | "error";
  duration_ms: number | null;
  config: Record<string, unknown>;
  output: unknown;
  input?: Record<string, unknown>;
  agent_run_id?: string | null;
}

export interface ExecutionResult {
  execution_id: string;
  status: string;
  output: unknown;
  block_outputs: Record<string, unknown>;
  block_logs?: LocalBlockLog[];
}

interface WorkflowExecutionPanelProps {
  workflowId: string;
  result: ExecutionResult | null;
  onClose: () => void;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "\u2014";
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatJson(value: unknown): string {
  if (value == null) return "\u2014";
  if (typeof value === "object" && Object.keys(value as object).length === 0) return "\u2014";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "";
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Lazily fetches and renders an agent run when expanded. */
function AgentRunInlineDetail({ agentRunId }: { agentRunId: string }) {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();
  const [expanded, setExpanded] = useState(false);
  const [run, setRun] = useState<AgentRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!expanded || fetchedRef.current || !hasAiAuth(token) || !ref) return;
    fetchedRef.current = true;
    setLoading(true);
    // Self-host: token is legitimately '' | null | undefined here — hasAiAuth
    // (not a type predicate) already proved that's OK; the proxy injects the
    // real credential regardless.
    runsApi
      .getAgentRun(token!, ref, agentRunId)
      .then((data) => setRun(data))
      .catch((err) => {
        console.error("Failed to fetch agent run detail:", err);
      })
      .finally(() => setLoading(false));
  }, [expanded, token, ref, agentRunId]);

  const systemMsg = run?.input_messages?.find((m) => m.role === "system");
  const userMsg = run?.input_messages?.find((m) => m.role === "user");
  const assistantContent =
    run?.content ??
    run?.output_messages?.find((m) => m.role === "assistant")?.content ??
    null;

  return (
    <div className="mt-2 border border-default rounded">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-foreground-muted hover:text-foreground hover:bg-surface-200 rounded transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="font-medium">Agent run</span>
        <span className="font-mono text-[10px] ml-1 truncate">{truncateRunId(agentRunId)}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {loading && (
            <p className="text-[10px] text-foreground-muted">Loading...</p>
          )}
          {!loading && run && (
            <>
              {/* Usage badge */}
              {run.usage && Object.keys(run.usage).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(run.usage).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-surface-300 text-foreground-muted"
                    >
                      {k.replace(/_/g, " ")}: {v}
                    </span>
                  ))}
                </div>
              )}
              {/* System message */}
              {systemMsg && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-medium">
                    System
                  </span>
                  <pre className="mt-0.5 p-1.5 rounded bg-surface-200 text-[11px] text-foreground whitespace-pre-wrap break-words font-mono max-h-24 overflow-y-auto">
                    {systemMsg.content}
                  </pre>
                </div>
              )}
              {/* User message */}
              {userMsg && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-medium">
                    User
                  </span>
                  <pre className="mt-0.5 p-1.5 rounded bg-surface-200 text-[11px] text-foreground whitespace-pre-wrap break-words font-mono max-h-24 overflow-y-auto">
                    {userMsg.content}
                  </pre>
                </div>
              )}
              {/* Assistant output */}
              {assistantContent && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-medium">
                    Assistant
                  </span>
                  <pre className="mt-0.5 p-1.5 rounded bg-surface-200 text-[11px] text-foreground whitespace-pre-wrap break-words font-mono max-h-32 overflow-y-auto">
                    {assistantContent}
                  </pre>
                </div>
              )}
            </>
          )}
          {!loading && !run && (
            <p className="text-[10px] text-foreground-muted">No detail available.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkflowExecutionPanel({
  workflowId,
  result,
  onClose,
}: WorkflowExecutionPanelProps) {
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
    result?.execution_id ?? null
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"input" | "output">("input");
  const [panelHeight, setPanelHeight] = useState(350);
  const isDragging = useRef(false);

  // Keep selectedExecutionId in sync when a new result arrives
  useEffect(() => {
    if (result?.execution_id) {
      setSelectedExecutionId(result.execution_id);
      setSelectedBlockId(null);
    }
  }, [result?.execution_id]);

  // Reset detail tab when selected block changes
  useEffect(() => {
    setDetailTab("input");
  }, [selectedBlockId]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const newHeight = window.innerHeight - e.clientY;
    setPanelHeight(Math.min(Math.max(newHeight, 120), window.innerHeight * 0.6));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  // Fetch execution history
  const { data: executionsData } = useWorkflowExecutionsQuery(workflowId);
  const executions = executionsData?.executions ?? [];

  // Determine if we're viewing the current run or a past one
  const isCurrentRun = selectedExecutionId === result?.execution_id;

  // Determine status of the selected execution (for polling decisions)
  const selectedExec = executions.find((e) => e.id === selectedExecutionId);
  const selectedExecStatus = isCurrentRun
    ? result?.status
    : selectedExec?.status;

  // Fetch block logs from API when the current result has no block_logs
  // (e.g. webhook-triggered runs) or when viewing a past run.
  // Poll every 2s while the execution is still running.
  const hasResultLogs = isCurrentRun && !!result?.block_logs?.length;
  const { data: pastLogsData, isLoading: pastLogsLoading } =
    useExecutionBlockLogsQuery(
      workflowId,
      hasResultLogs ? null : selectedExecutionId,
      { refetchInterval: selectedExecStatus === "running" ? 2000 : false }
    );

  // Normalize block logs to a common shape
  const blockLogs: Array<{
    block_id: string;
    block_type: string;
    block_name: string;
    status: string;
    duration_ms: number | null;
    output: unknown;
    input?: Record<string, unknown>;
    error?: string | null;
    agent_run_id?: string | null;
  }> = useMemo(() => {
    if (isCurrentRun && result?.block_logs?.length) {
      return result.block_logs;
    }
    if (pastLogsData?.block_logs) {
      return pastLogsData.block_logs;
    }
    return [];
  }, [isCurrentRun, result?.block_logs, pastLogsData?.block_logs]);

  const selectedLog = blockLogs.find((l) => l.block_id === selectedBlockId);

  return (
    <div
      className="border-t border-default bg-surface-100 flex flex-col"
      style={{ height: panelHeight }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="h-1 cursor-row-resize group flex items-center justify-center hover:bg-surface-300 transition-colors shrink-0"
      >
        <div className="w-8 h-0.5 rounded-full bg-border-default group-hover:bg-foreground-muted" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* Runs strip */}
          <RunsStrip
            executions={executions}
            selectedId={selectedExecutionId}
            currentRunId={result?.execution_id ?? null}
            onSelect={(id) => {
              setSelectedExecutionId(id);
              setSelectedBlockId(null);
            }}
          />

          {/* Block list */}
          <div className="w-2/5 border-r border-default overflow-y-auto p-2 space-y-0.5">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-medium">
                Logs
                {blockLogs.length > 0 && (
                  <span className="ml-1.5">({blockLogs.length})</span>
                )}
              </span>
              <button
                onClick={onClose}
                className="p-0.5 rounded hover:bg-surface-300 text-foreground-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {pastLogsLoading && !hasResultLogs && selectedExecutionId ? (
              <p className="text-xs text-foreground-muted p-2">Loading logs...</p>
            ) : blockLogs.length > 0 ? (
              blockLogs.map((log) => (
                <button
                  key={log.block_id}
                  onClick={() =>
                    setSelectedBlockId(
                      selectedBlockId === log.block_id ? null : log.block_id
                    )
                  }
                  className={cn(
                    "w-full flex items-center gap-3 px-2 py-1.5 rounded transition-colors",
                    selectedBlockId === log.block_id
                      ? "bg-surface-300"
                      : "hover:bg-surface-200"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block w-2 h-2 rounded-full shrink-0",
                      dotColorMap[blockRegistry[log.block_type]?.color] ?? "bg-slate-400"
                    )}
                  />
                  <span className="text-sm font-medium text-foreground truncate">
                    {log.block_name || log.block_id}
                  </span>
                  <span className="text-xs text-foreground-muted whitespace-nowrap">
                    {formatDuration(log.duration_ms)}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-block w-1.5 h-1.5 rounded-full",
                        log.status === "success" ? "bg-emerald-500" : "bg-destructive-400"
                      )}
                    />
                    <span className="text-[10px] text-foreground-muted">
                      {log.status}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-xs text-foreground-muted p-2">
                {selectedExecutionId
                  ? "No block logs for this run."
                  : "Select a run to view logs."}
              </p>
            )}
          </div>

          {/* Block detail */}
          <div className="flex-1 overflow-y-auto p-3">
            {selectedLog ? (
              <div className="space-y-3">
                {/* Input / Output tab bar */}
                <div className="flex items-center gap-0 border-b border-default">
                  <button
                    onClick={() => setDetailTab("input")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-colors border-b-2",
                      detailTab === "input"
                        ? "text-foreground border-brand-400"
                        : "text-foreground-muted border-transparent hover:text-foreground"
                    )}
                  >
                    Input
                  </button>
                  <button
                    onClick={() => setDetailTab("output")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-colors border-b-2",
                      detailTab === "output"
                        ? "text-foreground border-brand-400"
                        : "text-foreground-muted border-transparent hover:text-foreground"
                    )}
                  >
                    Output
                  </button>
                </div>
                {detailTab === "input" && (
                  <pre className="p-2 rounded bg-surface-200 text-xs text-foreground whitespace-pre-wrap break-words font-mono">
                    {formatJson(selectedLog.input)}
                  </pre>
                )}
                {detailTab === "output" && (
                  <pre className="p-2 rounded bg-surface-200 text-xs text-foreground whitespace-pre-wrap break-words font-mono">
                    {formatJson(selectedLog.output)}
                  </pre>
                )}
                {selectedLog.error && (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-red-100 font-medium">
                      Error
                    </span>
                    <pre className="mt-1 p-2 rounded bg-red-500/25 border border-red-300/60 text-xs text-red-50 whitespace-pre-wrap break-words font-mono">
                      {selectedLog.error}
                    </pre>
                  </div>
                )}
                {selectedLog.block_type === "agent" && selectedLog.agent_run_id ? (
                  <AgentRunInlineDetail agentRunId={selectedLog.agent_run_id} />
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-foreground-muted mt-4 text-center">
                Select a block to view its input and output.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Narrow vertical strip showing past runs */
function RunsStrip({
  executions,
  selectedId,
  currentRunId,
  onSelect,
}: {
  executions: WorkflowExecution[];
  selectedId: string | null;
  currentRunId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-44 shrink-0 border-r border-default overflow-y-auto">
      <div className="px-1.5 py-1.5 text-[10px] uppercase tracking-wider text-foreground-muted font-medium text-center">
        Workflow Executions
      </div>
      <div className="space-y-0.5 px-1">
        {executions.map((exec) => (
          <button
            key={exec.id}
            onClick={() => onSelect(exec.id)}
            className={cn(
              "w-full flex items-center px-1.5 py-1.5 rounded text-left transition-colors",
              selectedId === exec.id
                ? "bg-surface-300"
                : "hover:bg-surface-200"
            )}
          >
            <div className="flex flex-col min-w-0 w-full">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-foreground truncate">
                  {exec.id === currentRunId
                    ? "Current"
                    : formatRelativeTime(exec.created_at)}
                </span>
                <span
                  className={cn(
                    "text-[10px] shrink-0",
                    exec.status === "completed"
                      ? "text-emerald-300"
                      : exec.status === "failed"
                        ? "text-red-400"
                        : "text-foreground-muted"
                  )}
                >
                  {exec.status}
                </span>
              </div>
              <span className="text-[10px] text-foreground-muted font-mono truncate">
                {exec.id.slice(0, 8)}
              </span>
            </div>
          </button>
        ))}
        {executions.length === 0 && (
          <p className="text-xs text-foreground-muted text-center py-2">
            No executions yet
          </p>
        )}
      </div>
    </div>
  );
}
