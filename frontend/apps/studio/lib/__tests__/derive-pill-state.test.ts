import { describe, it, expect } from "vitest";
import { derivePillState } from "../trace-utils";

describe("derivePillState", () => {
  describe("non-reasoning models", () => {
    it("returns 'pre-stream' while streaming and no content yet", () => {
      // Restores the pre-#106 'thinking...' indicator for plain chat models
      const state = derivePillState(
        { reasoning_requested: false },
        true /* isStreamingThisMsg */,
        false /* hasReasoningEvents */,
        false /* hasContent */,
      );
      expect(state).toBe("pre-stream");
    });

    it("returns null once content has started streaming", () => {
      // The pill must disappear as soon as the first content token arrives
      const state = derivePillState(
        { reasoning_requested: false },
        true,
        false,
        true /* hasContent */,
      );
      expect(state).toBeNull();
    });

    it("returns null after streaming ends, regardless of content", () => {
      // No persistent pill on completed non-reasoning runs
      expect(
        derivePillState({ reasoning_requested: false }, false, false, false),
      ).toBeNull();
      expect(
        derivePillState({ reasoning_requested: false }, false, false, true),
      ).toBeNull();
    });

    it("treats undefined reasoning_requested the same as false", () => {
      // Before the BE start event lands, reasoning_requested is undefined.
      // We still want the transient thinking pill to render.
      expect(derivePillState({}, true, false, false)).toBe("pre-stream");
      expect(derivePillState({}, true, false, true)).toBeNull();
    });
  });

  describe("reasoning models — existing behavior preserved", () => {
    it("returns 'pre-stream' while streaming and no reasoning events yet", () => {
      const state = derivePillState(
        { reasoning_requested: true },
        true,
        false /* hasReasoningEvents */,
        false,
      );
      expect(state).toBe("pre-stream");
    });

    it("returns 'streaming' once reasoning events arrive (even with content)", () => {
      // Reasoning model: pill stays visible during streaming, and content
      // streaming should NOT hide it (unlike the non-reasoning case)
      const state = derivePillState(
        { reasoning_requested: true },
        true,
        true,
        true,
      );
      expect(state).toBe("streaming");
    });

    it("returns 'done-full' when stream ended with summary text", () => {
      const state = derivePillState(
        {
          reasoning_requested: true,
          reasoning: { summary_text: "I thought about it.", thinking_blocks: [] },
        },
        false,
        true,
        true,
      );
      expect(state).toBe("done-full");
    });

    it("returns 'done-empty' when no summary text", () => {
      const state = derivePillState(
        {
          reasoning_requested: true,
          reasoning: { summary_text: null, thinking_blocks: [] },
        },
        false,
        false,
        true,
      );
      expect(state).toBe("done-empty");
    });

    it("returns 'done-redacted' when redacted_thinking block present and no summary", () => {
      const state = derivePillState(
        {
          reasoning_requested: true,
          reasoning: {
            summary_text: null,
            thinking_blocks: [{ type: "redacted_thinking" }],
          },
        },
        false,
        false,
        true,
      );
      expect(state).toBe("done-redacted");
    });

    it("returns 'done-full' when redacted block present BUT summary also present", () => {
      const state = derivePillState(
        {
          reasoning_requested: true,
          reasoning: {
            summary_text: "summary",
            thinking_blocks: [{ type: "redacted_thinking" }],
          },
        },
        false,
        true,
        true,
      );
      expect(state).toBe("done-full");
    });
  });
});
