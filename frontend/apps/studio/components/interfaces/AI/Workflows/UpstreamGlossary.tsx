

import { useState, useRef, useEffect } from "react";
import { BookOpen, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { blockRegistry } from "@/data/ai-workflows/block-registry";
import type { Node, Edge } from "reactflow";

interface UpstreamGlossaryProps {
  nodeId: string;
  edges: Edge[];
  nodes: Node[];
}

function getUpstreamNodes(nodeId: string, edges: Edge[], nodes: Node[]): Node[] {
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const edge of edges) {
    if (edge.target === nodeId && !visited.has(edge.source)) {
      visited.add(edge.source);
      queue.push(edge.source);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        visited.add(edge.source);
        queue.push(edge.source);
      }
    }
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return [...visited].map((id) => nodeMap.get(id)).filter(Boolean) as Node[];
}

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

export function UpstreamGlossary({ nodeId, edges, nodes }: UpstreamGlossaryProps) {
  const [open, setOpen] = useState(true);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const upstreamNodes = getUpstreamNodes(nodeId, edges, nodes);
  if (upstreamNodes.length === 0) return null;

  const handleCopy = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
    } catch {
      // Clipboard API unavailable — silently degrade
    }
    setCopiedRef(ref);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedRef(null), 1500);
  };

  return (
    <div className="border-b border-default">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 w-full px-4 py-2 text-xs text-foreground-muted hover:text-foreground transition-colors"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span>Upstream References</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 ml-auto transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-3">
          {upstreamNodes.map((upNode) => {
            const fields = getSourceOutputFields(upNode);
            const label = upNode.data.label || upNode.id;
            return (
              <div key={upNode.id}>
                <span className="text-[10px] uppercase tracking-wider text-foreground-muted font-medium">
                  {label}
                </span>
                {fields.length === 0 ? (
                  <p className="text-[10px] text-foreground-muted mt-1 italic">
                    (no outputs)
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {fields.map((field) => {
                      const name = upNode.data.label || upNode.id;
                      const ref = upNode.data.blockType === "starter"
                        ? `<${name}.output.${field}>`
                        : `<${name}.${field}>`;
                      const isCopied = copiedRef === ref;
                      return (
                        <button
                          key={field}
                          onClick={() => handleCopy(ref)}
                          className="text-xs px-2 py-0.5 rounded bg-surface-200 text-foreground cursor-pointer hover:bg-surface-300 font-mono inline-flex items-center gap-1 transition-colors"
                          title={`Copy ${ref}`}
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-300" />
                              Copied!
                            </>
                          ) : (
                            ref
                          )}
                        </button>
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
}
