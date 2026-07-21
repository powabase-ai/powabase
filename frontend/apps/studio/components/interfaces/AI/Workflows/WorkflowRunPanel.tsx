

import { useState, useEffect } from "react";
import { useExecuteWorkflowMutation } from "@/data/ai-workflows";
import type { ExecutionResult } from "./WorkflowExecutionPanel";

interface Block {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface WorkflowRunPanelProps {
  workflowId: string;
  blocks: Block[];
  isOpen: boolean;
  onClose: () => void;
  onExecutionResult?: (result: ExecutionResult) => void;
}

function extractStarterVariables(blocks: Block[]): string[] {
  const starter = blocks.find((b) => b.type === "starter");
  if (!starter) return [];

  const input = starter.config?.input;
  if (!input) return [];

  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed);
    }
  } catch {
    // Not valid JSON
  }
  return [];
}

export function WorkflowRunPanel({
  workflowId,
  blocks,
  isOpen,
  onClose,
  onExecutionResult,
}: WorkflowRunPanelProps) {
  const executeMutation = useExecuteWorkflowMutation();
  const variableKeys = extractStarterVariables(blocks);
  const [variables, setVariables] = useState<Record<string, string>>({});

  // Forward execution result to parent
  useEffect(() => {
    if (executeMutation.data && onExecutionResult) {
      onExecutionResult(executeMutation.data as ExecutionResult);
    }
  }, [executeMutation.data, onExecutionResult]);

  if (!isOpen) return null;

  const handleExecute = () => {
    executeMutation.reset();
    const vars: Record<string, unknown> =
      variableKeys.length > 0
        ? Object.fromEntries(
            variableKeys.map((key) => [key, variables[key] ?? ""])
          )
        : {};

    executeMutation.mutate({
      workflowId,
      variables: variableKeys.length > 0 ? vars : undefined,
    });
  };

  const error = executeMutation.error as Error | null;

  return (
    <div className="w-80 border-l border-muted bg-surface-100 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-muted">
        <h2 className="text-sm font-semibold text-foreground">
          Run Workflow
        </h2>
        <button
          onClick={onClose}
          className="text-foreground-lighter hover:text-foreground transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Input Variables */}
        {variableKeys.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-foreground-lighter uppercase tracking-wide">
              Input Variables
            </h3>
            {variableKeys.map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium text-foreground-light mb-1">
                  {key}
                </label>
                <input
                  type="text"
                  value={variables[key] ?? ""}
                  onChange={(e) =>
                    setVariables((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 text-sm rounded-md border border-muted bg-surface-200 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
                  placeholder={`Enter ${key}...`}
                />
              </div>
            ))}
          </div>
        )}

        {variableKeys.length === 0 && (
          <p className="text-xs text-foreground-lighter">
            No input variables defined. The workflow will run with no inputs.
          </p>
        )}

        {/* Execute Button */}
        <button
          type="button"
          onClick={handleExecute}
          disabled={executeMutation.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white bg-brand-400 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {executeMutation.isPending ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Execute
            </>
          )}
        </button>

        {/* Error Display */}
        {error && (
          <div className="p-3 rounded-md bg-red-500/25 border border-red-300/60">
            <h3 className="text-xs font-medium text-red-100 mb-1">Error</h3>
            <p className="text-xs text-red-50">
              {error instanceof Error ? error.message : "Execution failed"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
