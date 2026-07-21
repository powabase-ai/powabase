import { describe, it, expect } from "vitest";
import { buildReasoningSteps } from "../trace-utils";

describe("buildReasoningSteps", () => {
  it("returns empty array for empty events", () => {
    expect(buildReasoningSteps([], false)).toEqual([]);
  });

  it("groups reasoning_delta events by step", () => {
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning_delta", step: 1, delta: "I should ", source: "thinking" },
      { type: "reasoning_delta", step: 1, delta: "search.", source: "thinking" },
      { type: "step_started", step: 2 },
      { type: "reasoning_delta", step: 2, delta: "Got results.", source: "thinking" },
    ];
    const steps = buildReasoningSteps(events, true);
    expect(steps).toEqual([
      { stepNumber: 1, reasoningText: "I should search.", toolNames: [], isLive: true },
      { stepNumber: 2, reasoningText: "Got results.", toolNames: [], isLive: true },
    ]);
  });

  it("attaches toolNames from tool_call events (single tool call)", () => {
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning_delta", step: 1, delta: "thinking", source: "thinking" },
      { type: "tool_call", step: 1, tool_name: "web_search" },
      { type: "tool_result", step: 1, tool_name: "web_search", duration_ms: 100 },
    ];
    const steps = buildReasoningSteps(events, true);
    expect(steps[0].toolNames).toEqual(["web_search"]);
  });

  it("accumulates multiple toolNames from parallel tool_result events", () => {
    // Anthropic & OpenAI both emit multiple tool_calls per assistant turn
    // when the model issues parallel calls. The pill must preserve each
    // distinct tool_result so the marker shows what really happened.
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning_delta", step: 1, delta: "thinking", source: "thinking" },
      { type: "tool_call", step: 1, tool_name: "knowledge_search" },
      { type: "tool_call", step: 1, tool_name: "knowledge_search" },
      { type: "tool_result", step: 1, tool_name: "knowledge_search", duration_ms: 100 },
      { type: "tool_result", step: 1, tool_name: "knowledge_search", duration_ms: 110 },
    ];
    const steps = buildReasoningSteps(events, true);
    expect(steps[0].toolNames).toEqual(["knowledge_search", "knowledge_search"]);
  });

  it("falls back to terminal reasoning event when no deltas (v1-era runs)", () => {
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning", step: 1, content: "Full reasoning text", source: "thinking" },
      { type: "tool_call", step: 1, tool_name: "kb_search" },
      { type: "tool_result", step: 1, tool_name: "kb_search", duration_ms: 234 },
      { type: "step_started", step: 2 },
      { type: "reasoning", step: 2, content: "Final answer reasoning", source: "thinking" },
    ];
    const steps = buildReasoningSteps(events, false);
    expect(steps).toEqual([
      { stepNumber: 1, reasoningText: "Full reasoning text", toolNames: ["kb_search"], isLive: false },
      { stepNumber: 2, reasoningText: "Final answer reasoning", toolNames: [], isLive: false },
    ]);
  });

  it("prefers delta-accumulated text over terminal reasoning when both present", () => {
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning_delta", step: 1, delta: "delta-text", source: "thinking" },
      { type: "reasoning", step: 1, content: "delta-text", source: "thinking" },
    ];
    const steps = buildReasoningSteps(events, true);
    expect(steps[0].reasoningText).toBe("delta-text"); // not duplicated
  });

  it("step_reset clears step's reasoningText and toolNames, marks live", () => {
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning_delta", step: 1, delta: "first attempt", source: "thinking" },
      { type: "step_reset", step: 1, reason: "rate_limit" },
      { type: "reasoning_delta", step: 1, delta: "retry attempt", source: "thinking" },
    ];
    const steps = buildReasoningSteps(events, true);
    expect(steps).toEqual([
      { stepNumber: 1, reasoningText: "retry attempt", toolNames: [], isLive: true },
    ]);
  });

  it("step_reset preserves step position when applied to second step", () => {
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning_delta", step: 1, delta: "first thought", source: "thinking" },
      { type: "tool_call", step: 1, tool_name: "search" },
      { type: "tool_result", step: 1, tool_name: "search", duration_ms: 100 },
      { type: "step_started", step: 2 },
      { type: "reasoning_delta", step: 2, delta: "trunc...", source: "thinking" },
      { type: "step_reset", step: 2, reason: "output_recovery" },
      { type: "reasoning_delta", step: 2, delta: "retry full text", source: "thinking" },
    ];
    const steps = buildReasoningSteps(events, true);
    expect(steps).toEqual([
      { stepNumber: 1, reasoningText: "first thought", toolNames: ["search"], isLive: true },
      { stepNumber: 2, reasoningText: "retry full text", toolNames: [], isLive: true },
    ]);
  });

  it("complete event marks all steps as not live", () => {
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning_delta", step: 1, delta: "x", source: "thinking" },
      { type: "complete", status: "completed" },
    ];
    const steps = buildReasoningSteps(events, false);
    expect(steps[0].isLive).toBe(false);
  });

  it("accepts events using legacy `event` field instead of `type` (v1 routes)", () => {
    const events = [
      { event: "step_started", step: 1 },
      { event: "reasoning", step: 1, content: "thoughts" },
    ];
    const steps = buildReasoningSteps(events, false);
    expect(steps[0].reasoningText).toBe("thoughts");
  });

  it("preserves tool-call invocation order across nested delegations", () => {
    // Scenario: supervisor calls delegate_to_agent1, which internally calls
    // knowledge_search, which finishes and returns; then delegate_to_agent1
    // returns. Event sequence has the OUTER tool_call FIRST but the OUTER
    // tool_result LAST (because the delegation envelope completes after the
    // child finishes). If toolNames is built from tool_result order, the
    // pill shows knowledge_search BEFORE delegate_to_agent1 — wrong from
    // the user's mental model. Pin tool_call (invocation) order here.
    const events = [
      { type: "step_started", step: 1 },
      { type: "reasoning_delta", step: 1, delta: "Looking up Vibevoice." },
      { type: "tool_call", step: 1, tool_name: "delegate_to_agent1" },
      { type: "delegation_started", agent: "agent1" },
      { type: "tool_call", step: 1, tool_name: "knowledge_search" },
      { type: "tool_result", step: 1, tool_name: "knowledge_search", duration_ms: 100 },
      { type: "delegation_completed", agent: "agent1" },
      { type: "tool_result", step: 1, tool_name: "delegate_to_agent1", duration_ms: 1500 },
    ];
    const steps = buildReasoningSteps(events, false);
    expect(steps[0].toolNames).toEqual(["delegate_to_agent1", "knowledge_search"]);
  });
});
