import { useRef, useState, useCallback } from "react";
import type { Node, Edge } from "reactflow";

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

interface WorkflowHistory {
  pushSnapshot: (nodes: Node[], edges: Edge[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isUndoRedoRef: React.MutableRefObject<boolean>;
}

export function useWorkflowHistory(
  initialNodes: Node[],
  initialEdges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  maxHistory: number = 10,
): WorkflowHistory {
  const historyRef = useRef<Snapshot[]>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const pointerRef = useRef(0);
  const isUndoRedoRef = useRef(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(pointerRef.current > 0);
    setCanRedo(pointerRef.current < historyRef.current.length - 1);
  }, []);

  const pushSnapshot = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (isUndoRedoRef.current) return;

      // Truncate any future entries beyond current pointer
      historyRef.current = historyRef.current.slice(0, pointerRef.current + 1);

      // Push new snapshot
      historyRef.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });

      // Enforce max history length
      if (historyRef.current.length > maxHistory) {
        historyRef.current = historyRef.current.slice(
          historyRef.current.length - maxHistory,
        );
      }

      pointerRef.current = historyRef.current.length - 1;
      updateFlags();
    },
    [maxHistory, updateFlags],
  );

  const undo = useCallback(() => {
    if (pointerRef.current <= 0) return;
    pointerRef.current -= 1;
    const snapshot = historyRef.current[pointerRef.current];
    isUndoRedoRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    // Clear the flag after React processes the state updates
    requestAnimationFrame(() => {
      isUndoRedoRef.current = false;
    });
    updateFlags();
  }, [setNodes, setEdges, updateFlags]);

  const redo = useCallback(() => {
    if (pointerRef.current >= historyRef.current.length - 1) return;
    pointerRef.current += 1;
    const snapshot = historyRef.current[pointerRef.current];
    isUndoRedoRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    requestAnimationFrame(() => {
      isUndoRedoRef.current = false;
    });
    updateFlags();
  }, [setNodes, setEdges, updateFlags]);

  return { pushSnapshot, undo, redo, canUndo, canRedo, isUndoRedoRef };
}
