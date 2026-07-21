import { describe, it, expect } from "vitest";
import { buildTraceTree } from "../trace-utils";

describe("buildTraceTree — step number tagging", () => {
  it("tags tool_call steps with their BE step number for reasoning lookup", () => {
    const events = [
      { event: "reasoning", step: 0, content: "Let me search", source: "thinking" },
      { event: "tool_call", step: 0, tool_name: "kb_search", arguments: { q: "x" } },
      { event: "tool_result", step: 0, tool_name: "kb_search", result_preview: "...", duration_ms: 5 },
    ];
    const tree = buildTraceTree(events);
    const toolStep = tree.find(s => s.type === "tool_call");
    expect(toolStep?.stepNumber).toBe(0);
  });

  it("tags delegation steps with their BE step number", () => {
    const events = [
      { event: "reasoning", step: 0, content: "Delegating to expert", source: "thinking" },
      { event: "tool_call", step: 0, tool_name: "delegate_to_expert", arguments: {} },
      { event: "delegation_started", agent: "expert" },
      { event: "delegation_completed", agent: "expert" },
    ];
    const tree = buildTraceTree(events);
    const delStep = tree.find(s => s.type === "delegation");
    expect(delStep?.stepNumber).toBe(0);
  });

  it("response step picks the highest BE step that emitted reasoning without a tool_call", () => {
    const events = [
      { event: "tool_call", step: 0, tool_name: "kb_search", arguments: {} },
      { event: "tool_result", step: 0, tool_name: "kb_search", result_preview: "..." },
      { event: "reasoning", step: 1, content: "Now I'll respond", source: "thinking" },
    ];
    const tree = buildTraceTree(events);
    const last = tree[tree.length - 1];
    expect(last.type).toBe("response");
    expect(last.stepNumber).toBe(1);
  });

  it("buildTraceTree always ends with a response step", () => {
    const events = [
      { event: "tool_call", step: 0, tool_name: "kb_search", arguments: {} },
      { event: "tool_result", step: 0, tool_name: "kb_search", result_preview: "..." },
    ];
    const tree = buildTraceTree(events);
    expect(tree[tree.length - 1].type).toBe("response");
  });

  it("response step has undefined stepNumber when no trailing reasoning", () => {
    const events = [
      { event: "reasoning", step: 0, content: "Pre-tool reasoning" },
      { event: "tool_call", step: 0, tool_name: "kb_search", arguments: {} },
      { event: "tool_result", step: 0, tool_name: "kb_search", result_preview: "..." },
    ];
    const tree = buildTraceTree(events);
    const last = tree[tree.length - 1];
    expect(last.type).toBe("response");
    expect(last.stepNumber).toBeUndefined();
  });

  it("parallel tool calls in the same BE step share the stepNumber", () => {
    // Both tool calls have step=0; reasoning lookup will resolve from the same key.
    const events = [
      { event: "reasoning", step: 0, content: "Need to look up two things", source: "thinking" },
      { event: "tool_call", step: 0, tool_name: "kb_search", arguments: { q: "x" } },
      { event: "tool_call", step: 0, tool_name: "lookup", arguments: { id: 1 } },
      { event: "tool_result", step: 0, tool_name: "kb_search", result_preview: "..." },
      { event: "tool_result", step: 0, tool_name: "lookup", result_preview: "..." },
    ];
    const tree = buildTraceTree(events);
    const toolSteps = tree.filter(s => s.type === "tool_call");
    expect(toolSteps).toHaveLength(2);
    expect(toolSteps[0].stepNumber).toBe(0);
    expect(toolSteps[1].stepNumber).toBe(0);
  });

  it("attaches per-scope reasoning text to tree nodes", () => {
    const events = [
      { event: "reasoning", step: 0, content: "thinking", source: "thinking" },
      { event: "tool_call", step: 0, tool_name: "kb_search", arguments: {} },
      { event: "tool_result", step: 0, tool_name: "kb_search", result_preview: "..." },
    ];
    const tree = buildTraceTree(events);
    const toolStep = tree.find((s) => s.type === "tool_call");
    expect(toolStep?.reasoning).toBe("thinking");
  });

  it("scopes reasoning per delegation envelope so child step 0 doesn't shadow parent step 0", () => {
    // Parent step 0 reasoning is "Parent thought".
    // Child agent runs inside delegation_started..completed envelope and ALSO uses step=0.
    // Child's "Child thought" must NOT overwrite or shadow the parent's reasoning.
    const events = [
      { event: "reasoning", step: 0, content: "Parent thought", source: "thinking" },
      { event: "tool_call", step: 0, tool_name: "delegate_to_expert", arguments: {} },
      { event: "delegation_started", agent: "expert" },
      { event: "reasoning", step: 0, content: "Child thought", source: "thinking" },
      { event: "tool_call", step: 0, tool_name: "kb_search", arguments: {} },
      { event: "tool_result", step: 0, tool_name: "kb_search", result_preview: "..." },
      { event: "delegation_completed", agent: "expert" },
    ];
    const tree = buildTraceTree(events);
    const delegation = tree.find((s) => s.type === "delegation");
    expect(delegation?.reasoning).toBe("Parent thought");
    const childToolStep = delegation?.child_steps?.find((s) => s.type === "tool_call");
    expect(childToolStep?.reasoning).toBe("Child thought");
  });
});
