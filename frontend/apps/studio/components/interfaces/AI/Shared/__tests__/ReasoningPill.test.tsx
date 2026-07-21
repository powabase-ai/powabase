import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReasoningPill } from "../ReasoningPill";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ReasoningPill", () => {
  it("renders pre-stream state with pulsing thinking label", () => {
    render(<ReasoningPill state="pre-stream" steps={[]} durationMs={null} />);
    expect(screen.getByText(/Thinking/i)).toBeInTheDocument();
  });

  it("renders streaming state with step counter", () => {
    render(
      <ReasoningPill
        state="streaming"
        steps={[
          { stepNumber: 1, reasoningText: "x", toolNames: [], isLive: true },
          { stepNumber: 2, reasoningText: "y", toolNames: [], isLive: true },
        ]}
        durationMs={null}
      />
    );
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();
    expect(screen.getByText(/2 step/)).toBeInTheDocument();
  });

  it("renders done-full state with thought-for-Xs label", () => {
    render(
      <ReasoningPill
        state="done-full"
        steps={[
          { stepNumber: 1, reasoningText: "I thought about it.", toolNames: [], isLive: false },
        ]}
        durationMs={3500}
      />
    );
    expect(screen.getByText(/Thought for/i)).toBeInTheDocument();
  });

  it("done-full state collapses by default; click expands", () => {
    render(
      <ReasoningPill
        state="done-full"
        steps={[
          { stepNumber: 1, reasoningText: "Hidden until clicked", toolNames: [], isLive: false },
        ]}
        durationMs={1000}
      />
    );
    expect(screen.queryByText(/Hidden until clicked/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/Hidden until clicked/)).toBeInTheDocument();
  });

  it("done-empty state shows no-summary message on expand", () => {
    render(<ReasoningPill state="done-empty" steps={[]} durationMs={500} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/No reasoning summary returned/i)).toBeInTheDocument();
  });

  it("done-redacted state shows redacted-by-safety message on expand", () => {
    render(<ReasoningPill state="done-redacted" steps={[]} durationMs={500} />);
    expect(screen.getByText(/redacted/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/redacted by safety policy/i)).toBeInTheDocument();
  });

  it("streaming state auto-expands and shows step content", () => {
    render(
      <ReasoningPill
        state="streaming"
        steps={[
          { stepNumber: 1, reasoningText: "Live thinking", toolNames: [], isLive: true },
        ]}
        durationMs={null}
      />
    );
    // Typewriter renders char-by-char via rAF — advance frame-by-frame so each
    // setRendered commit is flushed before the next rAF schedules. "Live thinking"
    // is 13 chars at default ~3 chars/frame; 6 frames (~96ms) is sufficient.
    for (let i = 0; i < 8; i++) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
    }
    expect(screen.getByText(/Live thinking/)).toBeInTheDocument();
  });
});
