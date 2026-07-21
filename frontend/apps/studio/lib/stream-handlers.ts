/**
 * Pure-function application of streaming SSE events to FE state.
 *
 * Extracted from runs/index.tsx for unit-testability without React or thread
 * mocks. Each function takes prev state and returns new state — `setState`
 * callbacks in the live router pass these directly.
 */

import type { ChatMessage } from "./ai-api";

export function applyContentDelta(
  messages: ChatMessage[],
  delta: string
): ChatMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return messages;
  const next = [...messages];
  next[next.length - 1] = { ...last, content: last.content + delta };
  return next;
}

export function applyTerminalChunkAppend(
  messages: ChatMessage[],
  content: string,
): ChatMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return messages;
  const next = [...messages];
  next[next.length - 1] = { ...last, content: last.content + content };
  return next;
}
