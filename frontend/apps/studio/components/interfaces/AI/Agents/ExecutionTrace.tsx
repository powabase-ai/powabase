

import { useEffect, useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth } from "@/lib/ai-api";
import { storageApi } from "@/lib/ai-api/storage";
import { CodeBlock } from "ui-patterns/CodeBlock";

export interface TraceStep {
  type: "tool_call" | "tool_result" | "delegation" | "response";
  tool_name?: string;
  agent_name?: string;
  input?: Record<string, unknown>;
  output?: string;
  /** Full tool result (from the complete event's tool_calls). May be string or multimodal list. */
  fullOutput?: string | unknown[];
  duration_ms?: number;
  child_steps?: TraceStep[];
  /** BE step number — preserved for tooling and tests. The reasoning text
   *  for this step is attached on `reasoning` directly (scoped per call to
   *  buildTraceTree, so child-agent steps don't collide with their parent). */
  stepNumber?: number;
  /** Reasoning text scoped to this step's agent. Empty/undefined means no
   *  reasoning was emitted for this step in this scope. */
  reasoning?: string;
}

interface ExecutionTraceProps {
  steps: TraceStep[];
  totalDurationMs?: number;
  /** Kept for back-compat with callers; no longer used internally now that
   *  reasoning is attached per-step at buildTraceTree time. */
  events?: Array<{ event?: string; type?: string; [key: string]: unknown }>;
}

/** Count all tool calls recursively (including inside delegations). */
function countToolCalls(steps: TraceStep[]): number {
  let count = 0;
  for (const s of steps) {
    if (s.type === "tool_call") count++;
    if (s.child_steps) count += countToolCalls(s.child_steps);
  }
  return count;
}

/** Count delegations. */
function countDelegations(steps: TraceStep[]): number {
  return steps.filter((s) => s.type === "delegation").length;
}

function isMultimodalOutput(output: unknown): output is Array<Record<string, unknown>> {
  return Array.isArray(output) && output.some(
    (b) => typeof b === "object" && b !== null &&
      ((b as Record<string, unknown>).type === "image_url" || (b as Record<string, unknown>).type === "image_ref")
  );
}

/**
 * Full-resolution image preview overlay. Closes on backdrop click or Escape.
 * Mounted to document.body via fixed positioning; covers the whole viewport.
 */
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    // Prevent body scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 cursor-zoom-out p-6"
    >
      <img
        src={src}
        alt={alt}
        // Stop propagation so a stray click on the image doesn't dismiss.
        onClick={(e) => e.stopPropagation()}
        className="max-w-[95vw] max-h-[95vh] object-contain rounded shadow-2xl cursor-default"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
      >
        ×
      </button>
    </div>
  );
}

function ToolCallImage({
  storagePath,
  format,
  onExpand,
}: {
  storagePath: string;
  format: string;
  onExpand?: (src: string, alt: string) => void;
}) {
  const { token, ref } = useProjectSupabaseClient();
  const [src, setSrc] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!hasAiAuth(token) || !ref || !ref) return;
    const slashIdx = storagePath.indexOf("/");
    if (slashIdx === -1) { setError(true); return; }
    const bucketId = storagePath.slice(0, slashIdx);
    const filePath = storagePath.slice(slashIdx + 1);

    let revoked = false;
    storageApi.downloadFile(token, ref, bucketId, filePath)
      .then((blob) => {
        if (!revoked) setSrc(URL.createObjectURL(blob));
      })
      .catch(() => setError(true));

    return () => {
      revoked = true;
    };
  }, [storagePath, token, ref]);

  useEffect(() => {
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [src]);

  if (error) return <span className="text-xs text-foreground-lighter">[Image unavailable]</span>;
  if (!src) return <div className="h-[100px] w-[200px] animate-pulse rounded bg-surface-200" />;
  const alt = `Tool result (${format})`;
  return (
    <img
      src={src}
      alt={alt}
      onClick={onExpand ? () => onExpand(src, alt) : undefined}
      className={`max-w-full max-h-[300px] object-contain rounded border border-muted ${onExpand ? "cursor-zoom-in hover:border-strong transition-colors" : ""}`}
    />
  );
}

function MultimodalOutput({ blocks }: { blocks: Array<Record<string, unknown>> }) {
  // Single shared lightbox per tool result. Holds {src, alt} when open.
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const openPreview = (src: string, alt: string) => setPreview({ src, alt });
  const closePreview = () => setPreview(null);

  return (
    <>
      <div className="mt-1 space-y-2 max-h-[400px] overflow-y-auto">
        {blocks.map((block, i) => {
          if (block.type === "image_url") {
            const url = (block.image_url as Record<string, string>)?.url;
            if (url) return (
              <img
                key={i}
                src={url}
                alt="Tool result"
                onClick={() => openPreview(url, "Tool result")}
                className="max-w-full max-h-[300px] object-contain rounded border border-muted cursor-zoom-in hover:border-strong transition-colors"
              />
            );
          }
          if (block.type === "image_ref") {
            return (
              <ToolCallImage
                key={i}
                storagePath={block.storage_path as string}
                format={(block.format as string) || "png"}
                onExpand={openPreview}
              />
            );
          }
          if (block.type === "text") {
            return (
              <pre key={i} className="bg-surface-200 px-2 py-1.5 rounded text-[10px] text-foreground-lighter whitespace-pre-wrap break-words">
                {block.text as string}
              </pre>
            );
          }
          return <pre key={i} className="text-[10px]">{JSON.stringify(block, null, 2)}</pre>;
        })}
      </div>
      {preview && <ImageLightbox src={preview.src} alt={preview.alt} onClose={closePreview} />}
    </>
  );
}

export function ExecutionTrace({ steps, totalDurationMs }: ExecutionTraceProps) {
  const [expanded, setExpanded] = useState(false);

  const delegationCount = countDelegations(steps);
  const toolCallCount = countToolCalls(steps);
  const durationStr = totalDurationMs ? `${(totalDurationMs / 1000).toFixed(1)}s` : "";

  // Build summary
  const parts: string[] = [];
  if (delegationCount > 0) parts.push(`${delegationCount} agent${delegationCount !== 1 ? "s" : ""}`);
  if (toolCallCount > 0) parts.push(`${toolCallCount} tool call${toolCallCount !== 1 ? "s" : ""}`);
  if (durationStr) parts.push(durationStr);

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground-lighter transition"
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>Execution trace · {parts.join(" · ")}</span>
      </button>

      {expanded && (
        <div className="mt-2 ml-1 space-y-1">
          {steps.map((step, i) => (
            <TraceStepItem key={i} step={step} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  return (
    <details className="mb-1 ml-5 text-[10px] text-foreground-lighter">
      <summary className="cursor-pointer text-foreground-muted italic">
        💭 Reasoning ({reasoning.length} chars)
      </summary>
      <div className="mt-1 whitespace-pre-wrap pl-2 border-l border-muted">
        {reasoning}
      </div>
    </details>
  );
}

function TraceStepItem({
  step,
  depth,
}: {
  step: TraceStep;
  depth: number;
}) {
  const [childExpanded, setChildExpanded] = useState(true); // default open for delegations
  const indent = depth * 16;

  const reasoning = step.reasoning;

  if (step.type === "delegation") {
    const childToolCount = step.child_steps ? countToolCalls(step.child_steps) : 0;
    return (
      <div style={{ marginLeft: indent }}>
        {reasoning && <ReasoningBlock reasoning={reasoning} />}
        <button
          onClick={() => setChildExpanded(!childExpanded)}
          className="flex items-center gap-1.5 text-xs hover:text-foreground transition w-full text-left py-0.5"
        >
          <span className="text-foreground-muted">{childExpanded ? "▾" : "▸"}</span>
          <span className="text-brand-600">→</span>
          <span className="font-medium text-foreground">{step.agent_name}</span>
          <span className="text-foreground-muted">
            [{step.child_steps?.length ?? 0} step{(step.child_steps?.length ?? 0) !== 1 ? "s" : ""}, {childToolCount} tool call{childToolCount !== 1 ? "s" : ""}]
          </span>
        </button>
        {childExpanded && step.child_steps && step.child_steps.length > 0 && (
          <div className="border-l border-muted ml-2 pl-2 space-y-0.5">
            {step.child_steps.map((cs, j) => (
              <TraceStepItem key={j} step={cs} depth={0} />
            ))}
          </div>
        )}
        {childExpanded && (!step.child_steps || step.child_steps.length === 0) && (
          <div className="ml-4 text-xs text-foreground-muted italic py-0.5">
            No tool calls (direct response)
          </div>
        )}
      </div>
    );
  }

  if (step.type === "tool_call" || step.type === "tool_result") {
    const hasError = step.output?.startsWith("{\"error\"") || step.output?.startsWith("Error:");
    const isMultimodal = step.fullOutput != null && isMultimodalOutput(step.fullOutput);
    // Determine if we have full output to show (and if it's longer than the preview)
    const fullOutputStr = step.fullOutput != null
      ? typeof step.fullOutput === "string"
        ? step.fullOutput
        : JSON.stringify(step.fullOutput, null, 2)
      : null;
    const hasExpandableOutput = isMultimodal || (fullOutputStr != null && fullOutputStr.length > 150);

    return (
      <div style={{ marginLeft: indent }}>
        {reasoning && <ReasoningBlock reasoning={reasoning} />}
        <ToolCallItem
          step={step}
          indent={0}
          hasError={!!hasError}
          fullOutputStr={fullOutputStr}
          hasExpandableOutput={hasExpandableOutput}
          isMultimodal={isMultimodal}
        />
      </div>
    );
  }

  // response type
  return (
    <div style={{ marginLeft: indent }} className="text-xs py-0.5">
      {reasoning && <ReasoningBlock reasoning={reasoning} />}
      <span className="text-foreground-muted">💬</span>
      <span className="ml-1.5 text-foreground">Generated response</span>
    </div>
  );
}

function codeExecLang(lang?: string): "python" | "js" {
  if (lang === "javascript") return "js";
  return "python";
}

function ToolCallItem({
  step,
  indent,
  hasError,
  fullOutputStr,
  hasExpandableOutput,
  isMultimodal,
}: {
  step: TraceStep;
  indent: number;
  hasError: boolean;
  fullOutputStr: string | null;
  hasExpandableOutput: boolean;
  isMultimodal: boolean;
}) {
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);
  const inputStr = step.input ? JSON.stringify(step.input, null, 2) : null;
  const hasExpandableInput = inputStr != null && inputStr.length > 150;

  // What to display for the output line
  let previewText: string;
  if (isMultimodal && Array.isArray(step.fullOutput)) {
    const blocks = step.fullOutput as Array<Record<string, unknown>>;
    const textCount = blocks.filter((b) => b.type === "text").length;
    const imageCount = blocks.filter((b) => b.type === "image_url" || b.type === "image_ref").length;
    previewText = `Retrieved context (${textCount} text, ${imageCount} image${imageCount !== 1 ? "s" : ""})`;
  } else {
    previewText = step.output ?? fullOutputStr?.slice(0, 150) ?? "";
  }

  return (
    <div style={{ marginLeft: indent }} className="text-xs py-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-foreground-muted">🔧</span>
        <span className="font-mono text-foreground">{step.tool_name}</span>
        {step.duration_ms != null && (
          <span className="text-foreground-muted">{step.duration_ms}ms</span>
        )}
        {hasError && (
          <span className="text-destructive-600 text-[10px]">error</span>
        )}
      </div>
      {step.tool_name === "code_execute" && step.input?.code ? (
        <div className="ml-5 mt-1">
          <button
            onClick={() => setInputExpanded(!inputExpanded)}
            className="text-[10px] text-brand-600 hover:text-brand-600 transition"
          >
            {inputExpanded ? "▾ Hide code" : "▸ Show code"}
          </button>
          {!inputExpanded && (() => {
            const code = step.input!.code as string;
            const firstLine = code.split("\n")[0];
            const truncated = firstLine.length > 80 || code.includes("\n");
            return (
              <code className="ml-1 bg-surface-200 px-1 rounded text-[10px] text-foreground-lighter">
                {firstLine.slice(0, 80)}{truncated ? "…" : ""}
              </code>
            );
          })()}
          {inputExpanded && (
            <div className="mt-1 rounded overflow-hidden max-h-[300px] overflow-y-auto text-[11px]">
              <CodeBlock
                language={codeExecLang(step.input.language as string)}
                hideLineNumbers={false}
                hideCopy={false}
                value={step.input.code as string}
              />
            </div>
          )}
        </div>
      ) : inputStr ? (
        <div className="ml-5 mt-0.5 text-foreground-muted">
          {hasExpandableInput ? (
            <>
              <button
                onClick={() => setInputExpanded(!inputExpanded)}
                className="text-[10px] text-brand-600 hover:text-brand-600 transition"
              >
                {inputExpanded ? "▾ Hide input" : "▸ Show input"}
              </button>
              {inputExpanded && (
                <pre className="mt-1 bg-surface-200 px-2 py-1.5 rounded text-[10px] text-foreground-lighter whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
                  {inputStr}
                </pre>
              )}
              {!inputExpanded && (
                <code className="bg-surface-200 px-1 rounded text-[10px] text-foreground-lighter">
                  {JSON.stringify(step.input).slice(0, 150)}
                </code>
              )}
            </>
          ) : (
            <code className="bg-surface-200 px-1 rounded text-[10px] text-foreground-lighter">
              {JSON.stringify(step.input).slice(0, 150)}
            </code>
          )}
        </div>
      ) : null}
      {(previewText || fullOutputStr) && (
        <div className="ml-5 mt-0.5">
          {hasExpandableOutput ? (
            <>
              <button
                onClick={() => setOutputExpanded(!outputExpanded)}
                className="text-[10px] text-brand-600 hover:text-brand-600 transition"
              >
                {outputExpanded ? "▾ Hide output" : "▸ Show output"}
              </button>
              {!outputExpanded && previewText && (
                <code className={`ml-1 bg-surface-200 px-1 rounded text-[10px] ${hasError ? "text-destructive-600" : "text-foreground-lighter"}`}>
                  → {previewText.slice(0, 150)}
                </code>
              )}
              {outputExpanded && (
                isMultimodal && Array.isArray(step.fullOutput)
                  ? <MultimodalOutput blocks={step.fullOutput as Array<Record<string, unknown>>} />
                  : <pre className={`mt-1 bg-surface-200 px-2 py-1.5 rounded text-[10px] whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto ${hasError ? "text-destructive-600" : "text-foreground-lighter"}`}>
                      {fullOutputStr}
                    </pre>
              )}
            </>
          ) : previewText ? (
            <code className={`bg-surface-200 px-1 rounded text-[10px] ${hasError ? "text-destructive-600" : "text-foreground-lighter"}`}>
              → {previewText.slice(0, 150)}
            </code>
          ) : null}
        </div>
      )}
    </div>
  );
}
