import { useEffect, useRef, useState } from "react";

export interface TypewriterOptions {
  /** Min advancement per rAF tick when no backlog. Default: 3. */
  charsPerFrame?: number;
  /** Max advancement per rAF tick (ceiling for adaptive). Default: 10. */
  maxCharsPerFrame?: number;
  /** Backlog threshold to double advancement. Default: 50. */
  backlogThreshold2x?: number;
  /** Backlog threshold to use maxCharsPerFrame. Default: 200. */
  backlogThresholdMax?: number;
  /** When true, snap rendered to target immediately and stop animating. */
  fastForward?: boolean;
}

/**
 * Backlog-driven adaptive typewriter. Returns the currently-visible substring
 * of `target`, advancing on each requestAnimationFrame tick. Speed scales with
 * the backlog (target.length - rendered.length) so bursty providers (Anthropic
 * thinking_blocks delivered in one chunk near stream end) catch up rather than
 * lag visibly.
 *
 * Cancel/regenerate guard: when target shrinks (e.g., regenerate replaced
 * mid-stream content with a fresh empty target), rendered snaps back to target
 * immediately rather than producing undefined behavior.
 *
 * Fast-forward: when fastForward becomes true (typically on the run's complete
 * event), rendered snaps to target immediately and rAF stops. Prevents
 * late-arriving Anthropic summaries from slow-typing for many seconds after
 * the response is otherwise complete.
 */
export function useTypewriter(
  target: string,
  opts?: TypewriterOptions
): string {
  const {
    charsPerFrame = 3,
    maxCharsPerFrame = 10,
    backlogThreshold2x = 50,
    backlogThresholdMax = 200,
    fastForward = false,
  } = opts ?? {};

  const [rendered, setRendered] = useState("");
  const renderedRef = useRef("");
  renderedRef.current = rendered;

  useEffect(() => {
    // Cancel/regenerate guard: target shrank → snap back immediately
    if (renderedRef.current.length > target.length) {
      setRendered(target);
      return;
    }
    // Fast-forward: snap to target and stop animating
    if (fastForward) {
      if (renderedRef.current !== target) {
        setRendered(target);
      }
      return;
    }
    if (renderedRef.current === target) {
      return;
    }

    let raf: number | null = null;
    const tick = () => {
      const cur = renderedRef.current;
      if (cur === target) {
        raf = null;
        return;
      }
      const backlog = target.length - cur.length;
      let advance = charsPerFrame;
      if (backlog >= backlogThresholdMax) {
        advance = maxCharsPerFrame;
      } else if (backlog >= backlogThreshold2x) {
        advance = Math.min(charsPerFrame * 2, maxCharsPerFrame);
      }
      const next = target.slice(0, cur.length + advance);
      setRendered(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
      }
    };
  }, [
    target,
    charsPerFrame,
    maxCharsPerFrame,
    backlogThreshold2x,
    backlogThresholdMax,
    fastForward,
  ]);

  return rendered;
}
