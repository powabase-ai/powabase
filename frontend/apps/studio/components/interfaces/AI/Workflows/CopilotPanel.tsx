

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CopilotMessage as CopilotMessageType,
  CopilotStreamEvent,
  WorkflowDiff,
} from "@/lib/ai-api";
import { hasAiAuth, streamCopilotChat } from "@/lib/ai-api";
import { useParams } from "common";
import { useSessionAccessTokenQuery } from "@/data/auth/session-access-token-query";
import {
  copilotKeys,
  useCopilotSessionQuery,
  useCopilotMessagesQuery,
  useCopilotModelQuery,
} from "@/data/ai-workflows/copilot-query";
import {
  useCreateCopilotSessionMutation,
  useDeleteCopilotSessionMutation,
  useSaveCopilotSnapshotMutation,
  useSetCopilotModelMutation,
} from "@/data/ai-workflows/copilot-mutations";
import type { WorkflowCanvasHandle } from "./WorkflowCanvas";
import { CopilotMessage } from "./CopilotMessage";
import { applyCopilotDiff } from "./copilot-diff";
import { ThinkingBubble } from "@/components/interfaces/AI/Shared/ThinkingBubble";

interface CopilotPanelProps {
  workflowId: string;
  canvasRef: React.RefObject<WorkflowCanvasHandle | null>;
}

export function CopilotPanel({ workflowId, canvasRef }: CopilotPanelProps) {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();

  // Session management
  const { data: sessionData, refetch: refetchSession } = useCopilotSessionQuery(workflowId);
  const sessionId = sessionData?.session?.id ?? null;
  const createSessionMutation = useCreateCopilotSessionMutation();
  const deleteSessionMutation = useDeleteCopilotSessionMutation();
  const saveSnapshotMutation = useSaveCopilotSnapshotMutation();

  // Invalidate messages cache on mount to catch messages
  // that completed while the user was away
  const queryClient = useQueryClient();
  useEffect(() => {
    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: copilotKeys.messages(sessionId) });
    }
  }, [sessionId, queryClient]);

  // Model selection
  const { data: modelData } = useCopilotModelQuery();
  const setModelMutation = useSetCopilotModelMutation();

  // Messages
  const { data: messagesData } = useCopilotMessagesQuery(sessionId);
  const [localMessages, setLocalMessages] = useState<CopilotMessageType[]>([]);

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const streamingContentRef = useRef("");
  const [statusMessage, setStatusMessage] = useState("");
  const [toolCalls, setToolCalls] = useState<Array<{ name: string; status: "running" | "done" }>>([]);
  const [reasoningText, setReasoningText] = useState("");
  const reasoningTextRef = useRef("");
  const [inputValue, setInputValue] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync server messages to local state, preserving local pre_snapshot values
  useEffect(() => {
    if (messagesData?.messages) {
      setLocalMessages((prev) => {
        // Build a map of local pre_snapshots to preserve
        type Snapshot = CopilotMessageType["pre_snapshot"];
        const localSnapshots = new Map<string, Snapshot>();
        for (const m of prev) {
          if (m.pre_snapshot) localSnapshots.set(m.id, m.pre_snapshot);
        }
        // Filter out optimistic messages that now have server counterparts
        const optimisticMsgs = prev.filter((m) => m.id.startsWith("optimistic-"));
        const serverIds = new Set(messagesData.messages.map((m) => m.id));
        const survivingOptimistic = optimisticMsgs.filter(
          (m) => !serverIds.has(m.id)
        );
        const merged = messagesData.messages.map((m) => ({
          ...m,
          pre_snapshot: m.pre_snapshot ?? localSnapshots.get(m.id) ?? null,
        }));
        // Keep any optimistic messages not yet reflected in server data
        // (they'll be filtered out once server catches up)
        return survivingOptimistic.length > 0
          ? [...merged, ...survivingOptimistic]
          : merged;
      });
    }
  }, [messagesData]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, streamingContent, toolCalls]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    const result = await createSessionMutation.mutateAsync(workflowId);
    await refetchSession();
    return result.id;
  }, [sessionId, workflowId, createSessionMutation, refetchSession]);

  const handleSend = useCallback(async () => {
    const message = inputValue.trim();
    if (!message || isStreaming || !hasAiAuth(token) || !ref || !canvasRef.current) return;

    setInputValue("");
    setIsStreaming(true);
    setStreamingContent("");
    setStatusMessage("");
    setToolCalls([]);
    setReasoningText("");
    streamingContentRef.current = "";
    reasoningTextRef.current = "";

    let sid = "";
    try {
      console.warn("[Copilot] ensuring session...");
      sid = await ensureSession();
      console.warn("[Copilot] session:", sid);

      // Capture current canvas state
      const nodes = canvasRef.current.getNodes();
      const edges = canvasRef.current.getEdges();
      // Build UUID→unique-name map so the copilot sees names everywhere (not UUIDs).
      // Disambiguate duplicates by appending a short UUID suffix.
      const nameCounts = new Map<string, number>();
      for (const n of nodes) {
        const label = (n.data.label as string) ?? "";
        nameCounts.set(label, (nameCounts.get(label) ?? 0) + 1);
      }
      const nameSeenSoFar = new Map<string, number>();
      const idToName = new Map<string, string>();
      for (const n of nodes) {
        const label = (n.data.label as string) ?? n.id;
        const count = nameCounts.get(label) ?? 1;
        if (count > 1) {
          const seq = (nameSeenSoFar.get(label) ?? 0) + 1;
          nameSeenSoFar.set(label, seq);
          idToName.set(n.id, `${label} #${seq}`);
        } else {
          idToName.set(n.id, label);
        }
      }
      const workflowState = {
        nodes: nodes.map((n) => ({
          id: idToName.get(n.id) ?? n.id,
          type: n.data.blockType,
          name: idToName.get(n.id) ?? n.data.label,
          position: n.position,
          config: n.data.config ?? {},
        })),
        edges: edges.map((e) => ({
          source: idToName.get(e.source) ?? e.source,
          target: idToName.get(e.target) ?? e.target,
          sourceHandle: e.sourceHandle ?? null,
        })),
      };

      // Add optimistic user message (prefixed so sync effect can filter it out)
      const userMsg: CopilotMessageType = {
        id: `optimistic-${crypto.randomUUID()}`,
        session_id: sid,
        role: "user",
        content: message,
        workflow_diff: null,
        pre_snapshot: null,
        created_at: new Date().toISOString(),
      };
      setLocalMessages((prev) => [...prev, userMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      let finalContent = "";
      let finalDiff: WorkflowDiff | null = null;
      let finalMessageId = "";

      console.warn("[Copilot] starting stream for session:", sid);

      await streamCopilotChat(
        token!,
        ref as string,
        sid,
        { message, workflow_state: workflowState },
        (event: CopilotStreamEvent) => {
          console.warn("[Copilot] event:", event.event);
          if (event.event === "chunk") {
            streamingContentRef.current += event.content;
            setStreamingContent(streamingContentRef.current);
            setStatusMessage("");
          } else if (event.event === "tool_call") {
            const name = event.tool_call?.name ?? "tool";
            setToolCalls((prev) => {
              // Mark any currently running tool as done
              const updated = prev.map((tc) =>
                tc.status === "running" ? { ...tc, status: "done" as const } : tc
              );
              return [...updated, { name, status: "running" as const }];
            });
            setStatusMessage(`Using ${name}...`);
          } else if (event.event === "status") {
            setStatusMessage(event.message);
          } else if (event.event === "reasoning_delta") {
            reasoningTextRef.current += event.delta;
            setReasoningText(reasoningTextRef.current);
          } else if (event.event === "complete") {
            finalContent = event.content;
            finalDiff = event.workflow_diff;
            finalMessageId = event.message_id;
            setStatusMessage("");
            setToolCalls([]);
          } else if (event.event === "error") {
            finalContent = `Error: ${event.error}`;
            finalDiff = null;
            finalMessageId = "";
            setStatusMessage("");
            setToolCalls([]);
          }
        },
        { signal: controller.signal }
      );

      console.warn("[Copilot] stream done, content length:", finalContent.length, "diff:", !!finalDiff);

      // Add assistant message to local state
      const assistantMsg: CopilotMessageType = {
        id: finalMessageId || crypto.randomUUID(),
        session_id: sid,
        role: "assistant",
        content: finalContent || streamingContentRef.current,
        workflow_diff: finalDiff,
        pre_snapshot: null,
        created_at: new Date().toISOString(),
      };
      setLocalMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent("");

      // Apply diff if present
      if (finalDiff && canvasRef.current) {
        // Push snapshot for Ctrl+Z
        canvasRef.current.pushSnapshot();

        // Capture pre-snapshot for per-message undo
        const preNodes = canvasRef.current.getNodes();
        const preEdges = canvasRef.current.getEdges();
        const preSnapshot = {
          nodes: preNodes.map((n) => ({
            id: n.id,
            type: n.data.blockType,
            name: n.data.label,
            position: n.position,
            config: n.data.config ?? {},
          })),
          edges: preEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? null,
          })),
        };

        // Apply the diff
        applyCopilotDiff(finalDiff, canvasRef.current.setNodes, canvasRef.current.setEdges);

        // Save snapshot to backend
        if (finalMessageId) {
          saveSnapshotMutation.mutate({
            sessionId: sid,
            messageId: finalMessageId,
            preSnapshot,
          });

          // Update local message with pre_snapshot
          setLocalMessages((prev) =>
            prev.map((m) =>
              m.id === finalMessageId ? { ...m, pre_snapshot: preSnapshot } : m
            )
          );
        }
      }

    } catch (err) {
      console.warn("[Copilot] error:", (err as Error).message, err);
      if ((err as Error).name !== "AbortError") {
        setStreamingContent("");
        const errorMsg: CopilotMessageType = {
          id: crypto.randomUUID(),
          session_id: sid || sessionId || "",
          role: "assistant",
          content: `Error: ${(err as Error).message}`,
          workflow_diff: null,
          pre_snapshot: null,
          created_at: new Date().toISOString(),
        };
        setLocalMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    inputValue, isStreaming, token, canvasRef, ref,
    ensureSession, sessionId, saveSnapshotMutation,
  ]);

  const handleUndoMessage = useCallback(
    (message: CopilotMessageType) => {
      if (!message.pre_snapshot || !canvasRef.current) return;

      const snapshot = message.pre_snapshot as {
        nodes: Array<{ id: string; type: string; name: string; position: { x: number; y: number }; config: Record<string, unknown> }>;
        edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null }>;
      };

      // Push current state for redo
      canvasRef.current.pushSnapshot();

      // Restore nodes from snapshot
      canvasRef.current.setNodes(
        snapshot.nodes.map((n) => ({
          id: n.id,
          type: "block",
          position: n.position,
          data: {
            blockType: n.type,
            label: n.name,
            config: n.config ?? {},
          },
        }))
      );

      // Restore edges from snapshot
      canvasRef.current.setEdges(
        snapshot.edges.map((e) => ({
          id: e.id ?? crypto.randomUUID(),
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          data: e.sourceHandle ? { condition: e.sourceHandle } : undefined,
        }))
      );
    },
    [canvasRef]
  );

  const handleReset = useCallback(async () => {
    if (!sessionId) return;
    await deleteSessionMutation.mutateAsync({ sessionId, workflowId });
    setLocalMessages([]);
    setStreamingContent("");
    refetchSession();
  }, [sessionId, workflowId, deleteSessionMutation, refetchSession]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-[min(480px,calc(100vw-4rem))] flex flex-col border-l border-muted bg-surface-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-muted">
        <h2 className="text-sm font-semibold text-foreground">
          Copilot
        </h2>
        <div className="flex items-center gap-2">
          {modelData?.options && (
            <select
              value={modelData.model}
              onChange={(e) => setModelMutation.mutate(e.target.value)}
              className="text-xs bg-surface-200 text-foreground border border-muted rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              {modelData.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleReset}
            disabled={!sessionId || isStreaming}
            className="text-xs text-foreground-lighter hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {localMessages.length === 0 && !isStreaming && (
          <div className="text-center text-sm text-foreground-lighter mt-8">
            <p>Ask me to help build your workflow.</p>
            <p className="mt-2 text-xs opacity-70">
              Try: &quot;Create a Q&amp;A workflow that takes a question and returns an answer&quot;
            </p>
          </div>
        )}

        {localMessages.map((msg) => (
          <CopilotMessage
            key={msg.id}
            message={msg}
            onUndo={msg.pre_snapshot ? handleUndoMessage : undefined}
          />
        ))}

        {reasoningText && (
          <div className="flex flex-col items-start gap-1">
            <div className="max-w-[85%] rounded-lg border border-muted bg-surface-100 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-foreground-lighter font-medium">
                  Thinking
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words text-xs italic text-foreground-lighter">
                {reasoningText}
              </div>
            </div>
          </div>
        )}

        {isStreaming && streamingContent && (
          <div className="flex flex-col items-start gap-1">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-surface-200 text-foreground">
              <div className="whitespace-pre-wrap break-words">{streamingContent}</div>
              <span className="inline-block w-1.5 h-4 bg-foreground-lighter animate-pulse ml-0.5" />
            </div>
            {statusMessage && (
              <div className="flex items-center gap-1.5 px-3">
                <div className="animate-spin h-3 w-3 border-[1.5px] border-foreground-lighter border-t-transparent rounded-full" />
                <span className="text-xs text-foreground-lighter">{statusMessage}</span>
              </div>
            )}
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex flex-col items-start gap-1">
            {!statusMessage && toolCalls.length === 0 ? (
              <ThinkingBubble />
            ) : (
              <div className="rounded-lg px-3 py-2.5 bg-surface-200 min-w-[200px]">
                <div className="flex flex-col gap-2">
                  {/* Prominent status message */}
                  {statusMessage && (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-brand-400 border-t-transparent rounded-full flex-shrink-0" />
                      <span className="text-sm text-foreground">{statusMessage}</span>
                    </div>
                  )}
                  {/* Tool call activity log */}
                  {toolCalls.length > 0 && (
                    <div className="flex flex-col gap-1 mt-0.5">
                      {toolCalls.map((tc, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          {tc.status === "done" ? (
                            <svg className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-brand-600 flex-shrink-0 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                          <span className={tc.status === "done" ? "text-foreground-lighter" : "text-foreground"}>
                            {tc.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-muted">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            rows={1}
            className="flex-1 resize-none rounded-md border border-muted bg-surface-200 text-sm text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400 placeholder:text-foreground-lighter"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            className="px-3 py-2 rounded-md text-sm font-medium text-white bg-brand-400 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
