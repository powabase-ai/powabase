

import { useParams } from "common"
import { useCallback, useEffect, useRef, useState } from "react";
import DefaultLayout from "@/components/layouts/DefaultLayout"
import AILayout from "@/components/layouts/AILayout/AILayout"
import type { NextPageWithLayout } from "@/types"
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Node, Edge } from "reactflow";
import { useQueryClient } from "@tanstack/react-query";
import {
  useWorkflowDetailQuery,
  useSaveGraphMutation,
  useUpdateWorkflowMutation,
  useExecuteWorkflowMutation,
  useDeployWorkflowMutation,
  useArmWebhookMutation,
  useWorkflowExecutionsQuery,
  exportWorkflowAsJson,
  validateWorkflowJson,
  workflowKeys,
} from "@/data/ai-workflows";
import { useSessionAccessTokenQuery } from "@/data/auth/session-access-token-query";
import {
  WorkflowExecutionPanel,
  type ExecutionResult,
} from "@/components/interfaces/AI/Workflows/WorkflowExecutionPanel";
import { CopilotPanel } from "@/components/interfaces/AI/Workflows/CopilotPanel";
import type { WorkflowCanvasHandle } from "@/components/interfaces/AI/Workflows/WorkflowCanvas";

const WorkflowCanvas = dynamic(
  () =>
    import("@/components/interfaces/AI/Workflows/WorkflowCanvas").then(
      (mod) => mod.WorkflowCanvas
    ),
  { ssr: false }
);

function extractStarterVariables(
  blocks: Array<{ id: string; type: string; config: Record<string, unknown> }>
): Array<{ key: string; defaultValue: string }> {
  const starter = blocks.find((b) => b.type === "starter");
  if (!starter) return [];
  const input = starter.config?.input;
  if (!input) return [];
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([key, val]) => ({
        key,
        defaultValue: String(val ?? ""),
      }));
    }
  } catch {
    // Not valid JSON
  }
  return [];
}

const WorkflowEditorPage: NextPageWithLayout = () => {
  const { ref } = useParams();
  const workflowId = useParams().workflow_id as string;

  const { data: token } = useSessionAccessTokenQuery();
  const queryClient = useQueryClient();
  const { data: workflow, isLoading, error } = useWorkflowDetailQuery(workflowId);
  const saveGraphMutation = useSaveGraphMutation();
  const updateMutation = useUpdateWorkflowMutation();
  const executeMutation = useExecuteWorkflowMutation();
  const deployMutation = useDeployWorkflowMutation();
  const armMutation = useArmWebhookMutation();

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGraphRef = useRef(saveGraphMutation);
  saveGraphRef.current = saveGraphMutation;

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [showCopilot, setShowCopilot] = useState(true);
  const canvasRef = useRef<WorkflowCanvasHandle>(null);
  const [importCounter, setImportCounter] = useState(0);

  // Webhook listening state
  const [isListening, setIsListening] = useState(false);
  const [preArmLatestExecId, setPreArmLatestExecId] = useState<string | null>(null);
  const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run popover state (for workflows with input variables)
  const [showRunPopover, setShowRunPopover] = useState(false);
  const [runVariables, setRunVariables] = useState<Record<string, string>>({});
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showRunPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as HTMLElement) &&
        runButtonRef.current &&
        !runButtonRef.current.contains(e.target as HTMLElement)
      ) {
        setShowRunPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showRunPopover]);

  // Forward execution result and open the panel
  useEffect(() => {
    if (executeMutation.data) {
      setExecutionResult(executeMutation.data as ExecutionResult);
      setShowPanel(true);
    }
  }, [executeMutation.data]);

  // Poll executions while listening for webhook trigger, or while deployed
  const isDeployed = workflow?.state === "deployed";
  const { data: execData } = useWorkflowExecutionsQuery(workflowId, {
    refetchInterval: isListening ? 2000 : isDeployed ? 5000 : false,
  });
  useEffect(() => {
    if (!execData?.executions?.length) return;
    const latest = execData.executions[0];

    // Armed webhook: detect new execution and stop listening
    if (isListening) {
      if (latest.id && latest.id !== preArmLatestExecId) {
        setIsListening(false);
        setPreArmLatestExecId(null);
        if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
        setExecutionResult({
          execution_id: latest.id,
          status: latest.status,
          output: latest.output,
          block_outputs: {},
        } as ExecutionResult);
        setShowPanel(true);
      }
      return;
    }

    // Deployed workflow: surface new executions automatically
    if (isDeployed && latest.id && latest.id !== executionResult?.execution_id) {
      setExecutionResult({
        execution_id: latest.id,
        status: latest.status,
        output: latest.output,
        block_outputs: {},
      } as ExecutionResult);
      setShowPanel(true);
    }
  }, [isListening, isDeployed, preArmLatestExecId, execData, executionResult?.execution_id]);

  // Cleanup listening timeout on unmount
  useEffect(() => {
    return () => {
      if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
    };
  }, []);

  const handleGraphChange = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSaveStatus("saving");
      debounceRef.current = setTimeout(() => {
        const blocks = nodes.map((node) => ({
          id: node.id,
          type: node.data.blockType,
          name: node.data.label,
          position: node.position,
          config: node.data.config ?? {},
          enabled: true,
        }));
        const edgeData = edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? null,
          condition: edge.data?.condition
            ?? (edge.sourceHandle && !/^\d+$/.test(edge.sourceHandle)
                ? edge.sourceHandle
                : null),
        }));
        saveGraphRef.current.mutate(
          { workflowId, graph: { blocks, edges: edgeData } },
          {
            onSuccess: () => setSaveStatus("saved"),
            onError: () => setSaveStatus("idle"),
          }
        );
      }, 500);
    },
    [workflowId]
  );

  const handleNameSave = () => {
    if (editName.trim() && editName.trim() !== workflow?.name) {
      updateMutation.mutate({
        workflowId,
        data: { name: editName.trim() },
      });
    }
    setIsEditingName(false);
  };

  const handleExecute = useCallback(
    (variables?: Record<string, unknown>) => {
      executeMutation.reset();
      executeMutation.mutate({
        workflowId,
        variables: variables && Object.keys(variables).length > 0 ? variables : undefined,
      });
      setShowRunPopover(false);
    },
    [workflowId, executeMutation]
  );

  const hasWebhook = (workflow?.blocks ?? []).some((b) => b.type === "webhook");

  const handleRunClick = useCallback(() => {
    if (!workflow) return;

    // Webhook-containing workflow in internal (or deployed for test run): arm and listen
    if (hasWebhook) {
      setPreArmLatestExecId(execData?.executions?.[0]?.id ?? null);
      setIsListening(true);
      armMutation.mutate(workflowId, {
        onSuccess: () => {
          console.log("[webhook] Armed successfully, listening for trigger...");
        },
        onError: (err) => {
          console.error("[webhook] Arm failed:", err);
          alert(`Failed to arm webhook: ${err instanceof Error ? err.message : String(err)}`);
          setIsListening(false);
          setPreArmLatestExecId(null);
          if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
        },
      });

      // 10-minute timeout
      if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = setTimeout(() => {
        setIsListening(false);
        setPreArmLatestExecId(null);
      }, 10 * 60 * 1000);
      return;
    }

    // Non-webhook workflow: normal run
    const blocks = (workflow.blocks ?? []).map((b) => ({
      id: b.id,
      type: b.type,
      config: b.config ?? {},
    }));
    const vars = extractStarterVariables(blocks);

    if (vars.length === 0) {
      handleExecute();
    } else {
      const initial: Record<string, string> = {};
      for (const v of vars) initial[v.key] = v.defaultValue;

      const allFilled = vars.every((v) => v.defaultValue.trim() !== "");
      if (allFilled) {
        handleExecute(initial);
      } else {
        setRunVariables(initial);
        setShowRunPopover(true);
      }
    }
  }, [workflow, handleExecute, hasWebhook, execData, armMutation, workflowId]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="p-8">
        <div className="text-destructive-600">
          {(error as Error)?.message || "Workflow not found"}
        </div>
        <Link
          href={`/project/${ref}/workflows`}
          className="mt-4 inline-block text-brand-600 hover:text-brand-600"
        >
          ← Back to workflows
        </Link>
      </div>
    );
  }

  const starterVars = extractStarterVariables(
    (workflow.blocks ?? []).map((b) => ({
      id: b.id,
      type: b.type,
      config: b.config ?? {},
    }))
  );
  const variableKeys = starterVars.map((v) => v.key);

  // Migrate old condition config (boolean/switch) to new branches format
  function migrateConditionConfig(cfg: Record<string, unknown>): Record<string, unknown> {
    if ("branches" in cfg) return cfg; // already new format
    const mode = cfg.mode as string;
    const expression = (cfg.expression as string) ?? "";
    // Remove legacy keys, keep everything else (_inputMappings, etc.)
    const { mode: _, expression: __, cases: ___, ...rest } = cfg;
    if (mode === "switch") {
      const cases = (cfg.cases as Array<{ cells: Record<string, string> }>) ?? [];
      const branches = cases
        .map((c) => c.cells?.["Case Label"]?.trim())
        .filter(Boolean)
        .map((label) => ({ expression: `${expression} == "${label}"` }));
      return { ...rest, branches: branches.length > 0 ? branches : [{ expression }] };
    }
    return { ...rest, branches: [{ expression }] };
  }

  // Transform backend blocks → ReactFlow nodes
  const initialNodes: Node[] = (workflow.blocks ?? []).map((block) => {
    let cfg = block.config ?? {};
    if (block.type === "condition") {
      cfg = migrateConditionConfig(cfg);
    }
    return {
      id: block.id,
      type: "block",
      position: block.position ?? { x: 0, y: 0 },
      data: {
        blockType: block.type,
        label: block.name,
        config: cfg,
      },
    };
  });

  // Build a map of condition block IDs to their migrated branches for edge migration
  const conditionBranchMap = new Map<string, Array<{ expression: string }>>();
  for (const node of initialNodes) {
    if (node.data.blockType === "condition") {
      conditionBranchMap.set(
        node.id,
        (node.data.config.branches as Array<{ expression: string }>) ?? []
      );
    }
  }

  // Backend edges map directly (same field names), with legacy handle migration
  const initialEdges: Edge[] = (workflow.edges ?? []).map((edge) => {
    let sourceHandle = edge.sourceHandle ?? undefined;
    let condition = edge.condition;

    // Migrate old condition handles
    if (sourceHandle && conditionBranchMap.has(edge.source)) {
      if (sourceHandle === "true") {
        sourceHandle = "if";
        condition = "if";
      } else if (sourceHandle === "false" || sourceHandle === "default") {
        sourceHandle = "else";
        condition = "else";
      } else {
        // Switch case label → find its position in migrated branches
        const branches = conditionBranchMap.get(edge.source) ?? [];
        const branchIdx = branches.findIndex(
          (b) => b.expression.endsWith(`== "${sourceHandle}"`)
        );
        if (branchIdx >= 0) {
          const newHandle = branchIdx === 0 ? "if" : `elif_${branchIdx}`;
          sourceHandle = newHandle;
          condition = newHandle;
        }
        // If not found, edge will be stale — leave as-is for cleanup
      }
    }

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle,
      targetHandle: edge.targetHandle ?? undefined,
      data: { condition: condition ?? (sourceHandle && !/^\d+$/.test(sourceHandle) ? sourceHandle : null) },
    };
  });

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-4 px-2 sm:px-4 py-2 border-b border-muted bg-surface-100 overflow-x-auto">
        <Link
          href={`/project/${ref}/workflows`}
          className="text-foreground-lighter hover:text-foreground transition"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>

        {isEditingName ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSave();
              if (e.key === "Escape") setIsEditingName(false);
            }}
            className="text-lg font-semibold text-foreground bg-transparent border-b border-brand-400 outline-none px-1"
            autoFocus
          />
        ) : (
          <h1
            className="text-lg font-semibold text-foreground cursor-pointer hover:text-brand-600"
            onClick={() => {
              setEditName(workflow.name);
              setIsEditingName(true);
            }}
          >
            {workflow.name}
          </h1>
        )}

        <span className="text-xs text-foreground-lighter">v{workflow.version}</span>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end">
          <span className="text-xs text-foreground-lighter">
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "Saved"}
          </span>
          {/* Deploy / Undeploy toggle */}
          {workflow.state === "deployed" ? (
            <button
              onClick={() => deployMutation.mutate({ workflowId, deploy: false })}
              disabled={deployMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Deployed
            </button>
          ) : (
            <button
              onClick={() => deployMutation.mutate({ workflowId, deploy: true })}
              disabled={deployMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-foreground border border-default hover:bg-surface-200 disabled:opacity-50 transition"
            >
              Deploy
            </button>
          )}
          <button
            onClick={() => exportWorkflowAsJson(workflow)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-foreground border border-default hover:bg-surface-200 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".json";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const parsed = JSON.parse(reader.result as string);
                    const result = validateWorkflowJson(parsed);
                    if (!result.valid) {
                      window.alert(`Invalid workflow file: ${result.error}`);
                      return;
                    }
                    // Cancel any pending debounced save to prevent race condition
                    if (debounceRef.current) {
                      clearTimeout(debounceRef.current);
                      debounceRef.current = null;
                    }
                    saveGraphMutation.mutateAsync({
                      workflowId,
                      graph: {
                        blocks: result.blocks,
                        edges: result.edges.map(({ id, ...rest }) => rest),
                      },
                    }).then(async () => {
                      // Cancel any debounce timer created while the import save was in-flight
                      if (debounceRef.current) {
                        clearTimeout(debounceRef.current);
                        debounceRef.current = null;
                      }
                      // Wait for the query refetch to complete so cache has fresh data
                      await queryClient.invalidateQueries({
                        queryKey: workflowKeys.detail(ref!, workflowId),
                      });
                      // Cancel any debounce timer created during the query refetch (Window B)
                      if (debounceRef.current) {
                        clearTimeout(debounceRef.current);
                        debounceRef.current = null;
                      }
                      setImportCounter((c) => c + 1);
                    }).catch(() => {
                      window.alert("Failed to import workflow: save error");
                    });
                  } catch {
                    window.alert("Invalid JSON file: could not parse");
                  }
                };
                reader.readAsText(file);
              };
              input.click();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-foreground border border-default hover:bg-surface-200 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>
          <button
            onClick={() => setShowCopilot((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition ${
              showCopilot
                ? "text-brand-600 border-brand-400 bg-brand-400/10"
                : "text-foreground border-default hover:bg-surface-200"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Copilot
          </button>
          <button
            onClick={() => setShowPanel((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-foreground border border-default hover:bg-surface-200 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>
          <div className="relative">
            <button
              type="button"
              ref={runButtonRef}
              onClick={isListening ? () => { setIsListening(false); setPreArmLatestExecId(null); if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current); } : handleRunClick}
              disabled={executeMutation.isPending || armMutation.isPending}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed transition ${
                isListening
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-brand-400 hover:bg-brand-500"
              }`}
            >
              {isListening ? (
                <>
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Listening...
                </>
              ) : executeMutation.isPending ? (
                <>
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Run
                </>
              )}
            </button>

            {/* Input variables popover */}
            {showRunPopover && variableKeys.length > 0 && (
              <div
                ref={popoverRef}
                className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1rem)] bg-surface-100 border border-default rounded-lg shadow-lg z-50"
              >
                <div className="p-3 border-b border-default">
                  <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
                    Input Variables
                  </h3>
                </div>
                <div className="p-3 space-y-3">
                  {variableKeys.map((key) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-foreground-light mb-1">
                        {key}
                      </label>
                      <input
                        type="text"
                        value={runVariables[key] ?? ""}
                        onChange={(e) =>
                          setRunVariables((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full px-3 py-1.5 text-sm rounded-md border border-muted bg-surface-200 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
                        placeholder={`Enter ${key}...`}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const vars: Record<string, unknown> = Object.fromEntries(
                        variableKeys.map((key) => [key, runVariables[key] ?? ""])
                      );
                      handleExecute(vars);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md text-white bg-brand-400 hover:bg-brand-500 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Execute
                  </button>
                </div>

                {/* Error display */}
                {executeMutation.error != null && (
                  <div className="px-3 pb-3">
                    <div className="p-2 rounded-md bg-red-500/25 border border-red-300/60">
                      <p className="text-xs text-red-50">
                        {executeMutation.error instanceof Error
                          ? executeMutation.error.message
                          : "Execution failed"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Inline error when popover is closed */}
          {executeMutation.error != null && !showRunPopover && (
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-red-500/25 border border-red-300/60">
              <p className="text-xs text-red-50">
                {executeMutation.error instanceof Error
                  ? executeMutation.error.message
                  : "Execution failed"}
              </p>
              <button
                onClick={() => executeMutation.reset()}
                className="text-xs text-red-50 hover:text-red-200 underline"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Canvas + Copilot sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1">
          <WorkflowCanvas
            canvasHandleRef={canvasRef}
            key={importCounter}
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            onGraphChange={handleGraphChange}
            token={token ?? undefined}
            projectRef={ref as string}
          />
        </div>
        {showCopilot && (
          <CopilotPanel
            workflowId={workflowId}
            canvasRef={canvasRef}
          />
        )}
      </div>

      {/* Bottom panel: execution results + history */}
      {showPanel && (
        <WorkflowExecutionPanel
          workflowId={workflowId}
          result={executionResult}
          onClose={() => {
            setShowPanel(false);
          }}
        />
      )}
    </div>
  );
}

WorkflowEditorPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Workflow Editor">{page}</AILayout>
  </DefaultLayout>
)

export default WorkflowEditorPage
