import type { TraceStep } from "@/components/interfaces/AI/Agents/ExecutionTrace";
import type { ActivityItem } from "@/lib/ai-api";

/** Shape of a tool call record from the `complete` SSE event. */
export interface ToolCallRecord {
  step: number;
  tool_name: string;
  arguments: Record<string, unknown>;
  result: string | unknown[];
  duration_ms: number;
}

/**
 * Build a nested TraceStep tree from flat SSE events.
 *
 * This is pure logic with no React dependencies -- extracted from the runs page
 * so it can be tested and reused independently.
 *
 * Reasoning text is attached per step at build time, using only events from
 * THIS scope (top-level supervisor events, or a delegation envelope's child
 * events). This avoids cross-scope step-number collisions: a supervisor's
 * step 0 and a delegated child agent's step 0 both exist in the flat event
 * stream but represent different agents — partitioning by scope keeps the
 * reasoning attached to the right step.
 *
 * @param toolCalls - optional full tool call records from the `complete` event,
 *   used to enrich each trace step with the full tool output.
 */
export function buildTraceTree(
  events: Array<{ event: string; [key: string]: unknown }>,
  toolCalls?: ToolCallRecord[],
): TraceStep[] {
  const steps: TraceStep[] = [];

  // ===== Track which BE steps have at least one tool_call =====
  // Steps WITHOUT (typically the final response step) hold "trailing"
  // reasoning that folds into the synthetic response step's stepNumber.
  const stepsWithToolCalls = new Set<number>();
  const reasoningSteps = new Set<number>();
  for (const e of events) {
    if (e.event === "tool_call") {
      stepsWithToolCalls.add(e.step as number);
    } else if (e.event === "reasoning" || e.event === "reasoning_delta") {
      reasoningSteps.add(e.step as number);
    }
  }

  // ===== Build scoped reasoning map =====
  // Only events at THIS scope feed the reasoning lookup — events inside a
  // delegation envelope are excluded so a child agent's step 0 reasoning
  // never overwrites the supervisor's step 0 reasoning. The recursive call
  // for delegation child_steps gets ITS own scoped events and computes its
  // own reasoning map.
  const scopedEvents: Array<{ event: string; [key: string]: unknown }> = [];
  let depth = 0;
  for (const e of events) {
    if (e.event === "delegation_started") {
      depth++;
      continue;
    }
    if (e.event === "delegation_completed") {
      if (depth > 0) depth--;
      continue;
    }
    if (depth === 0) scopedEvents.push(e);
  }
  const reasoningByStep = new Map<number, string>();
  for (const s of buildReasoningSteps(scopedEvents, false)) {
    reasoningByStep.set(s.stepNumber, s.reasoningText);
  }

  // ===== Main loop =====
  let i = 0;
  while (i < events.length) {
    const e = events[i];
    if (e.event === "tool_call" && (e.tool_name as string)?.startsWith("delegate_to_")) {
      // This is a delegation tool call. Look ahead for delegation_started..delegation_completed
      const beStep = e.step as number;
      const agentName = (e.tool_name as string).replace("delegate_to_", "").replace(/_/g, " ");
      const childEvents: Array<{ event: string; [key: string]: unknown }> = [];
      let j = i + 1;
      let foundDelegation = false;
      // Collect events between delegation_started and delegation_completed
      while (j < events.length) {
        const ev = events[j];
        if (ev.event === "delegation_started" && !foundDelegation) {
          foundDelegation = true;
          j++;
          continue;
        }
        if (ev.event === "delegation_completed" && ev.agent === (e.tool_name as string).replace("delegate_to_", "").replace(/_/g, " ")) {
          j++;
          break;
        }
        if (ev.event === "tool_result" && ev.tool_name === e.tool_name) {
          // This is the result for the delegate_to_X call itself
          j++;
          break;
        }
        if (foundDelegation) {
          childEvents.push(ev);
        }
        j++;
      }
      // Build child steps recursively
      const childSteps = buildTraceTree(childEvents);
      // Find the tool_result for this delegation
      let output: string | undefined;
      let duration: number | undefined;
      for (let k = i + 1; k < Math.min(j + 2, events.length); k++) {
        if (events[k]?.event === "tool_result" && events[k]?.tool_name === e.tool_name) {
          output = events[k].result_preview as string;
          duration = events[k].duration_ms as number;
          if (k >= j) j = k + 1;
          break;
        }
      }
      steps.push({
        type: "delegation",
        agent_name: agentName,
        tool_name: e.tool_name as string,
        input: e.arguments as Record<string, unknown>,
        output,
        duration_ms: duration,
        stepNumber: beStep,
        reasoning: reasoningByStep.get(beStep),
        child_steps: childSteps,
      });
      i = j;
    } else if (e.event === "tool_call") {
      // Regular tool call -- look for its result
      const beStep = e.step as number;
      const toolName = e.tool_name as string;
      let output: string | undefined;
      let duration: number | undefined;
      for (let k = i + 1; k < events.length; k++) {
        if (events[k]?.event === "tool_result" && events[k]?.tool_name === toolName) {
          output = events[k].result_preview as string;
          duration = events[k].duration_ms as number;
          break;
        }
      }
      steps.push({
        type: "tool_call",
        tool_name: toolName,
        input: e.arguments as Record<string, unknown>,
        output,
        duration_ms: duration,
        stepNumber: beStep,
        reasoning: reasoningByStep.get(beStep),
      });
      i++;
    } else if (e.event === "tool_result") {
      // Skip -- already merged into tool_call
      i++;
    } else if (e.event === "delegation_started" || e.event === "delegation_completed") {
      // Skip -- handled by delegation tool_call processing
      i++;
    } else if (e.event === "step_started" || e.event === "step_completed") {
      // Skip internal step markers
      i++;
    } else if (e.event === "reasoning" || e.event === "reasoning_delta") {
      // Reasoning is attached to each step via reasoningByStep above; the
      // text itself comes from buildReasoningSteps over THIS scope's events.
      i++;
    } else {
      i++;
    }
  }

  // ===== Synthetic response step =====
  // The response step's stepNumber is the highest BE step that emitted
  // reasoning without a tool_call -- i.e. the final "trailing" reasoning
  // before the response. Its reasoning text is looked up from this scope's
  // reasoningByStep so the parent "wrap-up" thought renders separately
  // from any child agent's wrap-up.
  let trailingStep: number | undefined;
  for (const step of reasoningSteps) {
    if (!stepsWithToolCalls.has(step)) {
      if (trailingStep === undefined || step > trailingStep) trailingStep = step;
    }
  }
  steps.push({
    type: "response",
    stepNumber: trailingStep,
    reasoning: trailingStep != null ? reasoningByStep.get(trailingStep) : undefined,
  });

  // Enrich tool call steps with full output from the complete event's tool_calls
  if (toolCalls && toolCalls.length > 0) {
    _enrichStepsWithFullOutput(steps, toolCalls);
  }

  return steps;
}

/**
 * Match tool call records to trace steps and attach fullOutput.
 * Uses tool_name + order-of-appearance matching (same tool called multiple times).
 */
function _enrichStepsWithFullOutput(steps: TraceStep[], toolCalls: ToolCallRecord[]): void {
  // Build a consumption index: for each tool_name, track which record to use next
  const byName = new Map<string, ToolCallRecord[]>();
  for (const tc of toolCalls) {
    const arr = byName.get(tc.tool_name) ?? [];
    arr.push(tc);
    byName.set(tc.tool_name, arr);
  }
  const consumed = new Map<string, number>();

  function walk(list: TraceStep[]) {
    for (const step of list) {
      if (step.type === "tool_call" && step.tool_name) {
        const records = byName.get(step.tool_name);
        if (records) {
          const idx = consumed.get(step.tool_name) ?? 0;
          if (idx < records.length) {
            step.fullOutput = records[idx].result;
            consumed.set(step.tool_name, idx + 1);
          }
        }
      }
      if (step.type === "delegation" && step.child_steps) {
        walk(step.child_steps);
      }
    }
  }
  walk(steps);
}

/**
 * Build ActivityItem[] from stored run events for historical display.
 * All items are marked "done" since these are completed runs.
 */
export function buildActivityItemsFromEvents(
  events: Array<{ event: string; [key: string]: unknown }>
): ActivityItem[] {
  const items: ActivityItem[] = [];
  let counter = 0;
  let activeDelegationId: string | null = null;

  for (const e of events) {
    if (e.event === "tool_call") {
      const toolName = e.tool_name as string;
      if (toolName?.startsWith("delegate_to_")) continue;
      items.push({
        id: `tc_${counter++}`,
        kind: "tool",
        status: "done",
        toolName,
        arguments: e.arguments as Record<string, unknown>,
        parentDelegationId: activeDelegationId ?? undefined,
        startedAt: 0,
      });
    } else if (e.event === "tool_result") {
      const toolName = e.tool_name as string;
      if (toolName?.startsWith("delegate_to_")) continue;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].kind === "tool" && items[i].toolName === toolName && !items[i].durationMs) {
          items[i] = { ...items[i], durationMs: e.duration_ms as number, resultPreview: e.result_preview as string };
          break;
        }
      }
    } else if (e.event === "delegation_started") {
      const id = `del_${counter++}`;
      activeDelegationId = id;
      items.push({
        id,
        kind: "delegation",
        status: "done",
        agentName: e.agent as string,
        startedAt: 0,
      });
    } else if (e.event === "delegation_completed") {
      activeDelegationId = null;
    }
  }
  return items;
}

export interface ReasoningStep {
  stepNumber: number;
  reasoningText: string;
  /** Tool names called during this step, in tool_call (invocation) order.
   *  Anthropic and OpenAI both support multiple parallel tool calls per
   *  assistant turn — preserving each name as a distinct marker keeps the
   *  pill faithful to what the model actually did.
   *
   *  We track tool_call (not tool_result) because of nested delegations:
   *  delegate_to_X fires its tool_call FIRST but its tool_result LAST
   *  (after all child agent operations finish), so tool_result-order
   *  would surface knowledge_search BEFORE delegate_to_agent in the pill
   *  — wrong from the user's mental model. */
  toolNames: string[];
  isLive: boolean;
}

interface TraceEventLike {
  type?: string;
  event?: string;
  step?: number;
  delta?: string;
  content?: string;
  source?: string;
  tool_name?: string;
  status?: string;
  reason?: string;
  duration_ms?: number;
}

/**
 * Aggregate event stream into per-step reasoning entries for the ReasoningPill
 * expanded view.
 *
 * Handles:
 * - reasoning_delta events: accumulate per step (modern path)
 * - terminal reasoning events: fallback when no deltas accumulated (v1-era runs)
 * - tool_call events: attach toolName for the step's marker (in invocation
 *   order — see ReasoningStep.toolNames docstring for why this matters
 *   under nested delegations)
 * - step_reset events: clear the step's reasoningText and toolName, mark live
 *   (issued by agent.py on retry paths — model_fallback, reactive_compact, output_recovery)
 * - complete events: flip all steps' isLive false
 *
 * Accepts both `type` and legacy `event` field for the discriminator (v1 routes
 * emitted some events with `event:` due to JSON serialization).
 */
export function buildReasoningSteps(
  events: TraceEventLike[],
  isLiveRun: boolean,
): ReasoningStep[] {
  const stepsByNumber = new Map<number, ReasoningStep>();
  const accumulatedDelta = new Map<number, boolean>();

  const eventType = (e: TraceEventLike): string =>
    (e.type ?? e.event ?? "") as string;

  const ensureStep = (stepNumber: number): ReasoningStep => {
    let s = stepsByNumber.get(stepNumber);
    if (!s) {
      s = {
        stepNumber,
        reasoningText: "",
        toolNames: [],
        isLive: isLiveRun,
      };
      stepsByNumber.set(stepNumber, s);
    }
    return s;
  };

  for (const ev of events) {
    const t = eventType(ev);
    const step = ev.step;
    if (step == null) {
      if (t === "complete") {
        for (const s of stepsByNumber.values()) {
          s.isLive = false;
        }
      }
      continue;
    }

    if (t === "step_started") {
      ensureStep(step);
    } else if (t === "reasoning_delta") {
      const s = ensureStep(step);
      s.reasoningText += ev.delta ?? "";
      accumulatedDelta.set(step, true);
    } else if (t === "reasoning") {
      const s = ensureStep(step);
      // v1 fallback: only fill from terminal if no deltas accumulated.
      if (!accumulatedDelta.get(step)) {
        s.reasoningText = ev.content ?? "";
      }
    } else if (t === "tool_call") {
      const s = ensureStep(step);
      if (ev.tool_name) {
        s.toolNames.push(ev.tool_name);
      }
    } else if (t === "step_reset") {
      const s = ensureStep(step);
      s.reasoningText = "";
      s.toolNames = [];
      s.isLive = true;
      accumulatedDelta.delete(step);
    }
  }

  // Filter out truly-empty steps: step_started fired but no reasoning text
  // accumulated AND no tool was called. Common case: the final-answer step on
  // adaptive-reasoning models that decided not to think before responding.
  // Rendering "Step N" with empty body looks broken; better to omit.
  return [...stepsByNumber.values()]
    .filter((s) => s.reasoningText.length > 0 || s.toolNames.length > 0)
    .sort((a, b) => a.stepNumber - b.stepNumber);
}

// ===== Pill state derivation =====

export type ReasoningPillState =
  | "pre-stream"
  | "streaming"
  | "done-full"
  | "done-empty"
  | "done-redacted";

export interface PillStateInput {
  reasoning_requested?: boolean;
  reasoning?: {
    thinking_blocks?: Array<{ type?: string }>;
    summary_text?: string | null;
  } | null;
}

/**
 * Decide which pill state — or none — should render for an assistant message.
 *
 * Two routes through this function depending on whether the model returns
 * reasoning:
 *
 *   - **Reasoning models** (`reasoning_requested === true`): full lifecycle —
 *     pre-stream → streaming → done-{full,empty,redacted}. Pill stays visible
 *     after completion so the user can re-expand and read the chain of
 *     thought.
 *
 *   - **Non-reasoning models** (`reasoning_requested` falsy): show a transient
 *     "Thinking..." pill while we're waiting for the first content token, and
 *     hide it as soon as content arrives or the stream ends. This restores
 *     the pre-#106 UX where every chat had a "thinking" indicator before the
 *     first token landed, without polluting completed messages.
 *
 * Returns `null` to hide the pill.
 */
export function derivePillState(
  msg: PillStateInput,
  isStreamingThisMsg: boolean,
  hasReasoningEvents: boolean,
  hasContent: boolean,
): ReasoningPillState | null {
  if (!msg.reasoning_requested) {
    if (isStreamingThisMsg && !hasContent) return "pre-stream";
    return null;
  }
  if (isStreamingThisMsg && !hasReasoningEvents) return "pre-stream";
  if (isStreamingThisMsg) return "streaming";
  const blocks = msg.reasoning?.thinking_blocks ?? [];
  const hasRedacted = blocks.some((b) => b.type === "redacted_thinking");
  const hasSummary = !!msg.reasoning?.summary_text;
  if (hasRedacted && !hasSummary) return "done-redacted";
  if (!hasSummary) return "done-empty";
  return "done-full";
}
