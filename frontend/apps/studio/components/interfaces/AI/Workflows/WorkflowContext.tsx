

import { createContext, useContext } from "react";
import type { Node, Edge } from "reactflow";

type SetState<T> = React.Dispatch<React.SetStateAction<T[]>>;

interface WorkflowContextValue {
  setNodes: SetState<Node>;
  setEdges: SetState<Edge>;
  updateNodeConfigAndRefresh: (
    nodeId: string,
    updater: (prevConfig: Record<string, unknown>) => Record<string, unknown>
  ) => void;
}

export const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export function useWorkflowState() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflowState must be used inside WorkflowCanvas");
  return ctx;
}
