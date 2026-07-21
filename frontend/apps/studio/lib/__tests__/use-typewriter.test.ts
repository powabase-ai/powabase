import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTypewriter } from "../use-typewriter";

beforeEach(() => {
  // Vitest's fake timers natively mock requestAnimationFrame/cancelAnimationFrame
  // (16ms tick). advanceTimersByTime(16) fires one rAF callback.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTypewriter", () => {
  it("starts with empty rendered when target is empty", () => {
    const { result } = renderHook(() => useTypewriter(""));
    expect(result.current).toBe("");
  });

  it("advances rendered toward target on each rAF tick", () => {
    const { result } = renderHook(
      ({ target }: { target: string }) =>
        useTypewriter(target, { charsPerFrame: 3 }),
      { initialProps: { target: "hello world" } }
    );
    expect(result.current).toBe("");
    act(() => {
      vi.advanceTimersByTime(16); // one frame
    });
    expect(result.current).toBe("hel");
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current).toBe("hello ");
  });

  it("idles when rendered catches up to target", () => {
    const { result } = renderHook(() =>
      useTypewriter("hi", { charsPerFrame: 10 })
    );
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current).toBe("hi");
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(result.current).toBe("hi");
  });

  it("handles target growing across re-renders (streaming case)", () => {
    const { result, rerender } = renderHook(
      ({ target }: { target: string }) =>
        useTypewriter(target, { charsPerFrame: 3 }),
      { initialProps: { target: "abc" } }
    );
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current).toBe("abc");

    rerender({ target: "abcdefghij" });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current).toBe("abcdef");
  });

  it("snaps rendered backward when target shrinks (regenerate case)", () => {
    const { result, rerender } = renderHook(
      ({ target }: { target: string }) =>
        useTypewriter(target, { charsPerFrame: 100 }),
      { initialProps: { target: "long original target" } }
    );
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current).toBe("long original target");

    rerender({ target: "short" });
    expect(result.current).toBe("short");
  });

  it("snaps to target when fastForward becomes true", () => {
    const { result, rerender } = renderHook(
      ({ target, fastForward }: { target: string; fastForward: boolean }) =>
        useTypewriter(target, { charsPerFrame: 1, fastForward }),
      { initialProps: { target: "this is a long target", fastForward: false } }
    );
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current).toBe("t");

    rerender({ target: "this is a long target", fastForward: true });
    expect(result.current).toBe("this is a long target");
  });

  it("accelerates advance when backlog exceeds threshold2x", () => {
    const { result } = renderHook(() =>
      useTypewriter("x".repeat(100), {
        charsPerFrame: 3,
        maxCharsPerFrame: 10,
        backlogThreshold2x: 50,
        backlogThresholdMax: 200,
      })
    );
    act(() => {
      vi.advanceTimersByTime(16);
    });
    // Backlog 100 >= 50 → 2x → 6 chars/frame
    expect(result.current.length).toBe(6);
  });

  it("caps advance at maxCharsPerFrame", () => {
    const { result } = renderHook(() =>
      useTypewriter("x".repeat(500), {
        charsPerFrame: 3,
        maxCharsPerFrame: 10,
        backlogThreshold2x: 50,
        backlogThresholdMax: 200,
      })
    );
    act(() => {
      vi.advanceTimersByTime(16);
    });
    // Backlog 500 >= 200 → max → 10 chars/frame
    expect(result.current.length).toBe(10);
  });
});
