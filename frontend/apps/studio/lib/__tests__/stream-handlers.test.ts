import { describe, it, expect } from "vitest";
import {
  applyContentDelta,
  applyTerminalChunkAppend,
} from "../stream-handlers";
import type { ChatMessage } from "../ai-api";

describe("applyContentDelta", () => {
  it("appends to last assistant message", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi " },
    ];
    const result = applyContentDelta(msgs, "world");
    expect(result[1].content).toBe("hi world");
  });

  it("no-ops when last message is not assistant", () => {
    const msgs: ChatMessage[] = [{ role: "user", content: "hello" }];
    const result = applyContentDelta(msgs, "world");
    expect(result).toEqual(msgs);
  });
});

describe("applyTerminalChunkAppend", () => {
  it("appends event.content to last assistant message (today's APPEND semantics)", () => {
    const msgs: ChatMessage[] = [{ role: "assistant", content: "" }];
    const result = applyTerminalChunkAppend(msgs, "the answer is 42");
    expect(result[0].content).toBe("the answer is 42");
  });
});
