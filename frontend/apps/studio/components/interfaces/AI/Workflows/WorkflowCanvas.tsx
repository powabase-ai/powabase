

import { useCallback, useEffect, useImperativeHandle, useMemo, useState, useRef } from "react";
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  useUpdateNodeInternals,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { flushSync } from "react-dom";

import { BlockNode } from "./BlockNode";
import { BlockPalette, SINGLETON_TYPES } from "./BlockPalette";
import { BlockConfigPanel } from "./BlockConfigPanel";
import { getDefaultConfig, blockRegistry, type InputMapping } from "@/data/ai-workflows/block-registry";
import { evaluateCondition } from "./condition-utils";
import { WorkflowContext } from "./WorkflowContext";
import { useWorkflowHistory } from "./useWorkflowHistory";
import { Undo2, Redo2 } from "lucide-react";

const nodeTypes = { block: BlockNode };

/** Sub-block types that accept text references */
const TEXT_INPUT_TYPES = new Set(["short-input", "long-input", "code"]);

/**
 * Get eligible text-input field IDs for a block type,
 * respecting condition visibility based on the node's current config.
 */
function getEligibleFields(blockType: string, nodeConfig: Record<string, unknown>): string[] {
  const config = blockRegistry[blockType];
  if (!config) return [];
  return config.subBlocks
    .filter((sb) => TEXT_INPUT_TYPES.has(sb.type) && !sb.noAutoMap && evaluateCondition(sb.condition, nodeConfig))
    .map((sb) => sb.id);
}

/** Get output field names for a source node */
function getSourceOutputFields(sourceNode: Node): string[] {
  const srcType = sourceNode.data?.blockType as string;
  if (!srcType) return ["output"];
  if (srcType === "starter") {
    const inputConfig = sourceNode.data?.config?.input;
    if (inputConfig && typeof inputConfig === "object" && !Array.isArray(inputConfig)) {
      const keys = Object.keys(inputConfig as Record<string, unknown>);
      return keys.length > 0 ? keys : [];
    }
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
}

export interface WorkflowCanvasHandle {
  getNodes: () => Node[];
  getEdges: () => Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  pushSnapshot: () => void;
}

interface WorkflowCanvasProps {
  /** Initial nodes from saved graph */
  initialNodes?: Node[];
  /** Initial edges from saved graph */
  initialEdges?: Edge[];
  /** Called when graph changes (for save) */
  onGraphChange?: (nodes: Node[], edges: Edge[]) => void;
  /** Auth props for API calls */
  token?: string;
  projectRef?: string;
  /**
   * Imperative handle exposing getNodes/getEdges/setNodes/setEdges/pushSnapshot.
   * Passed as a named prop (not React's forwardRef `ref`) because next/dynamic
   * in Pages Router intercepts `ref` to attach its own retry method and does not
   * forward it to the inner component. Using a named prop sidesteps that.
   */
  canvasHandleRef?: React.Ref<WorkflowCanvasHandle>;
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowCanvasInner({
  initialNodes = [],
  initialEdges = [],
  onGraphChange,
  token,
  projectRef,
  canvasHandleRef,
}: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const blockCountRef = useRef(initialNodes.length);

  const { pushSnapshot, undo, redo, canUndo, canRedo, isUndoRedoRef } =
    useWorkflowHistory(initialNodes, initialEdges, setNodes, setEdges);

  // Expose imperative handle for copilot panel
  useImperativeHandle(canvasHandleRef, () => ({
    getNodes: () => reactFlowInstance.current?.getNodes() ?? nodes,
    getEdges: () => reactFlowInstance.current?.getEdges() ?? edges,
    setNodes,
    setEdges,
    pushSnapshot: () => {
      const currentNodes = reactFlowInstance.current?.getNodes() ?? [];
      const currentEdges = reactFlowInstance.current?.getEdges() ?? [];
      pushSnapshot(currentNodes, currentEdges);
    },
  }), [nodes, edges, setNodes, setEdges, pushSnapshot]);

  const pendingSnapshotRef = useRef<number | null>(null);

  const takeSnapshot = useCallback(() => {
    if (pendingSnapshotRef.current !== null) {
      cancelAnimationFrame(pendingSnapshotRef.current);
    }
    pendingSnapshotRef.current = requestAnimationFrame(() => {
      pendingSnapshotRef.current = null;
      const currentNodes = reactFlowInstance.current?.getNodes() ?? [];
      const currentEdges = reactFlowInstance.current?.getEdges() ?? [];
      pushSnapshot(currentNodes, currentEdges);
    });
  }, [pushSnapshot]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && (e.key === "y" || (e.key === "Z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // Notify parent whenever nodes or edges change
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    onGraphChange?.(nodes, edges);
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup stale edges for both condition and split blocks
  const cleanupStaleEdges = useCallback((updatedNodes: Node[]) => {
    const dynamicNodes = updatedNodes.filter(
      (n) => n.data.blockType === "condition" || n.data.blockType === "split"
    );
    if (dynamicNodes.length === 0) return;

    setEdges((eds) => {
      const filtered = eds.filter((edge) => {
        if (!edge.sourceHandle) return true;
        const sourceNode = dynamicNodes.find((n) => n.id === edge.source);
        if (!sourceNode) return true; // not a dynamic-handle block, keep

        const blockType = sourceNode.data.blockType;

        if (blockType === "split") {
          const branches = (sourceNode.data.config?.branches as number) || 2;
          const validHandles = Array.from({ length: branches }, (_, i) => String(i + 1));
          return validHandles.includes(edge.sourceHandle);
        }

        if (blockType === "condition") {
          const branches = (sourceNode.data.config?.branches as Array<{ expression: string }>) ?? [];
          const validHandles = [
            ...branches.map((_: { expression: string }, i: number) => (i === 0 ? "if" : `elif_${i}`)),
            "else",
          ];
          return validHandles.includes(edge.sourceHandle);
        }

        return true;
      });
      return filtered.length === eds.length ? eds : filtered;
    });
  }, [setEdges]);

  const refreshNodeLayout = useCallback((nodeId: string) => {
    const rerenderEdges = () => {
      setEdges((eds) =>
        eds.map((e) =>
          e.source === nodeId || e.target === nodeId ? { ...e } : e
        )
      );
    };

    updateNodeInternals(nodeId);
    rerenderEdges();

    requestAnimationFrame(() => {
      updateNodeInternals(nodeId);
      rerenderEdges();

      requestAnimationFrame(() => {
        updateNodeInternals(nodeId);
        rerenderEdges();
      });
    });
  }, [setEdges, updateNodeInternals]);

  const isValidConnection = useCallback(
    (connection: Connection) => connection.source !== connection.target,
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge(connection, eds);
        if (connection.sourceHandle) {
          // Split blocks use numeric handle IDs ("1", "2", …) — don't tag those as conditions.
          // All other named handles (condition true/false, switch case labels) get a condition.
          const sourceNode = reactFlowInstance.current?.getNodes().find((n) => n.id === connection.source);
          const isSplitHandle =
            sourceNode?.data?.blockType === "split" && /^\d+$/.test(connection.sourceHandle);
          if (!isSplitHandle) {
            const lastIdx = newEdges.length - 1;
            newEdges[lastIdx] = {
              ...newEdges[lastIdx],
              data: { ...newEdges[lastIdx].data, condition: connection.sourceHandle },
            };
          }
        }
        return newEdges;
      });

      // Auto-map: create _inputMappings entries if exactly one eligible field
      if (connection.source && connection.target) {
        const sourceId = connection.source;
        const targetId = connection.target;

        setNodes((nds) => {
          const targetNode = nds.find((n) => n.id === targetId);
          const sourceNode = nds.find((n) => n.id === sourceId);
          if (!targetNode || !sourceNode) return nds;

          const blockType = targetNode.data.blockType;
          const eligible = getEligibleFields(blockType, targetNode.data.config ?? {});
          if (eligible.length !== 1) return nds;

          const targetField = eligible[0];
          const outputFields = getSourceOutputFields(sourceNode);
          const fields = outputFields.length > 0 ? outputFields : ["output"];
          if (fields.length !== 1) return nds;

          const existingMappings: InputMapping[] = [
            ...((targetNode.data.config?._inputMappings as InputMapping[]) ?? []),
          ];

          let changed = false;
          for (const outputField of fields) {
            const exists = existingMappings.some(
              (m) => m.sourceId === sourceId && m.outputField === outputField
            );
            if (!exists) {
              existingMappings.push({ sourceId, outputField, targetField });
              changed = true;
            }
          }

          if (!changed) return nds;

          const updatedConfig = { ...targetNode.data.config, _inputMappings: existingMappings };

          return nds.map((n) =>
            n.id === targetId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    config: updatedConfig,
                  },
                }
              : n
          );
        });
      }

      // Snapshot after connect
      takeSnapshot();
    },
    [setEdges, setNodes, takeSnapshot],
  );

  // Clean up _inputMappings when edges are deleted
  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      const sourcesByTarget = new Map<string, Set<string>>();
      for (const edge of deletedEdges) {
        const set = sourcesByTarget.get(edge.target) ?? new Set();
        set.add(edge.source);
        sourcesByTarget.set(edge.target, set);
      }

      setNodes((nds) =>
        nds.map((n) => {
          const removedSources = sourcesByTarget.get(n.id);
          if (!removedSources) return n;
          const mappings = (n.data.config?._inputMappings as InputMapping[]) ?? [];
          const filtered = mappings.filter((m) => !removedSources.has(m.sourceId));
          if (filtered.length === mappings.length) return n;
          return {
            ...n,
            data: {
              ...n.data,
              config: { ...n.data.config, _inputMappings: filtered },
            },
          };
        })
      );

      takeSnapshot();
    },
    [setNodes, takeSnapshot],
  );

  const existingBlockTypes = useMemo(
    () => new Set(nodes.map((n) => n.data.blockType as string)),
    [nodes],
  );

  // Add block from palette
  const handleAddBlock = useCallback(
    (blockType: string, config: Record<string, unknown>) => {
      if (SINGLETON_TYPES.has(blockType) && existingBlockTypes.has(blockType)) return;
      blockCountRef.current += 1;
      const id = crypto.randomUUID();
      const label = `${blockRegistry[blockType]?.name ?? blockType} ${blockCountRef.current}`;

      // Auto-generate webhook_id and secret for webhook blocks
      const finalConfig = blockType === "webhook"
        ? {
            ...config,
            webhook_id: crypto.randomUUID(),
            webhook_secret: crypto.randomUUID(),
          }
        : config;

      const newNode: Node = {
        id,
        type: "block",
        position: {
          x: 250 + Math.random() * 100,
          y: 100 + blockCountRef.current * 80,
        },
        data: {
          blockType,
          label,
          config: finalConfig,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      takeSnapshot();
    },
    [setNodes, existingBlockTypes, takeSnapshot],
  );

  // Handle drop from palette drag
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const blockType = event.dataTransfer.getData("blockType");
      if (!blockType || !reactFlowInstance.current) return;
      if (SINGLETON_TYPES.has(blockType) && existingBlockTypes.has(blockType)) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      blockCountRef.current += 1;
      const id = crypto.randomUUID();
      const label = `${blockRegistry[blockType]?.name ?? blockType} ${blockCountRef.current}`;
      const defaultConfig = getDefaultConfig(blockType);
      const finalConfig = blockType === "webhook"
        ? {
            ...defaultConfig,
            webhook_id: crypto.randomUUID(),
            webhook_secret: crypto.randomUUID(),
          }
        : defaultConfig;
      const newNode: Node = {
        id,
        type: "block",
        position,
        data: {
          blockType,
          label,
          config: finalConfig,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      takeSnapshot();
    },
    [setNodes, existingBlockTypes, takeSnapshot],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Update node config from panel
  const handleUpdateConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      let updatedNodes: Node[] = [];

      flushSync(() => {
        setNodes((nds) => {
          updatedNodes = nds.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
          );
          return updatedNodes;
        });
      });

      cleanupStaleEdges(updatedNodes);
      refreshNodeLayout(nodeId);
      takeSnapshot();
    },
    [setNodes, cleanupStaleEdges, refreshNodeLayout, takeSnapshot],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const updateNodeConfigAndRefresh = useCallback(
    (nodeId: string, updater: (prevConfig: Record<string, unknown>) => Record<string, unknown>) => {
      let updatedNodes: Node[] = [];

      flushSync(() => {
        setNodes((nds) => {
          updatedNodes = nds.map((n) => {
            if (n.id !== nodeId) return n;
            const prevConfig = (n.data.config ?? {}) as Record<string, unknown>;
            const nextConfig = updater(prevConfig);
            return {
              ...n,
              data: {
                ...n.data,
                config: nextConfig,
              },
            };
          });
          return updatedNodes;
        });
      });

      cleanupStaleEdges(updatedNodes);
      refreshNodeLayout(nodeId);
    },
    [setNodes, cleanupStaleEdges, refreshNodeLayout],
  );

  const workflowCtx = useMemo(
    () => ({ setNodes, setEdges, updateNodeConfigAndRefresh }),
    [setNodes, setEdges, updateNodeConfigAndRefresh],
  );

  return (
    <WorkflowContext.Provider value={workflowCtx}>
    <div className="flex h-full w-full">
      <BlockPalette onAddBlock={handleAddBlock} existingBlockTypes={existingBlockTypes} />

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          isValidConnection={isValidConnection}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDragStop={() => takeSnapshot()}
          onNodesDelete={() => takeSnapshot()}
          onInit={(instance) => {
            reactFlowInstance.current = instance;

            // After fitView completes and the viewport settles,
            // remeasure all handle positions so first-drag edges are correct
            requestAnimationFrame(() => {
              const allNodeIds = instance.getNodes().map((n) => n.id);
              allNodeIds.forEach((nid) => updateNodeInternals(nid));
            });
          }}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: {
              stroke: 'hsl(var(--border-strong))',
              strokeWidth: 2,
            },
          }}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          className="bg-default"
        >
          <div className="absolute bottom-4 left-4 z-10 flex gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="rounded border border-default bg-surface-100 p-1.5 text-foreground-light hover:bg-surface-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="rounded border border-default bg-surface-100 p-1.5 text-foreground-light hover:bg-surface-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Redo2 size={16} />
            </button>
          </div>
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={0.8}
            color="hsl(var(--border-muted))"
          />
          <MiniMap
            style={{
              backgroundColor: 'hsl(var(--background-surface-100))',
              border: '1px solid hsl(var(--border-default))',
              borderRadius: 8,
            }}
            nodeColor={(node) => {
              const color = blockRegistry[node.data?.blockType]?.color;
              const hex: Record<string, string> = {
                emerald: '#34d399', violet: '#8b5cf6', amber: '#f59e0b',
                orange: '#f97316', blue: '#3b82f6', teal: '#14b8a6', cyan: '#06b6d4', slate: '#94a3b8',
              };
              return hex[color] || '#71717a';
            }}
            maskColor="rgb(9 9 11 / 0.7)"
            pannable
            zoomable={false}
          />
        </ReactFlow>
      </div>

      {selectedNode && (
        <BlockConfigPanel
          node={selectedNode}
          onUpdate={handleUpdateConfig}
          onClose={() => setSelectedNodeId(null)}
          edges={edges}
          nodes={nodes}
          token={token}
          projectRef={projectRef}
        />
      )}
    </div>
    </WorkflowContext.Provider>
  );
}
