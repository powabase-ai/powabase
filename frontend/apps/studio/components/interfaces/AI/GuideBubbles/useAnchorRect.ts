import { useEffect, useState } from 'react'

import { ONBOARDING_ATTR } from './onboarding-anchors'

export interface AnchorRectState {
  /** Live viewport rect of the target, or null until it's found. */
  rect: DOMRect | null
  /** Flips true once the element has been located with a real layout box. */
  found: boolean
  /**
   * Flips true once the anchor has been polled for ANCHOR_NOT_FOUND_TIMEOUT_MS
   * without ever being found. Polling stops permanently for this anchor once
   * this fires — the caller is expected to react (auto-advance/skip the step)
   * rather than leave the overlay pointing at nothing.
   */
  timedOut: boolean
}

/**
 * Resolve a `data-onboarding-id` anchor to a live DOMRect.
 *
 * Two phases, to avoid a perpetual per-frame layout flush:
 *  - **Not found yet:** poll for the element (handling not-yet-mounted targets
 *    after a route change, a dialog opening, or the user navigating to a detail
 *    page). The overlay shows the step's instruction meanwhile. Polling is
 *    itself throttled and bounded (see below) rather than running forever.
 *  - **Found:** STOP the rAF loop and keep the bubble glued via scroll (capture) +
 *    resize listeners for fast movement, plus a cheap ~4fps interval that catches
 *    resizable-panel drags / reflow and detects the anchor losing its box (e.g. the
 *    user navigated away) — at which point it drops back to polling to re-acquire.
 *    This replaces the old every-frame `getBoundingClientRect` (a synchronous
 *    layout flush 60×/s for the whole time a bubble is open, measurable jank on
 *    heavy pages like the Schema Graph).
 *
 * The not-found phase is itself throttled: it polls every animation frame for
 * the first NOT_FOUND_FAST_POLL_WINDOW_MS (fast reaction for the common case —
 * a route/dialog transition that resolves in well under a second), then drops
 * to a ~4fps NOT_FOUND_THROTTLE_MS interval so a target that legitimately never
 * mounts (a stale anchor, a feature the user can't reach) doesn't busy-poll
 * `querySelectorAll` + `getBoundingClientRect` 60×/s indefinitely. If the anchor
 * is still missing after ANCHOR_NOT_FOUND_TIMEOUT_MS, polling stops for good and
 * `timedOut` flips true — the caller (GuideBubbleOverlay) is expected to
 * auto-advance/skip the step rather than leave the spotlight pointing at nothing.
 * Two exceptions to the soft timeout, both driven by the `waitForUserAction` arg:
 *  - `waitForUserAction` steps (the engine doesn't navigate/act for these — the
 *    user must open a dialog, create a resource, etc. first) never hit the soft
 *    timeout; they poll at the throttled rate for as long as the step stays active.
 *  - Other steps get their not-found clock reset on a genuine user interaction
 *    (pointerdown/keydown), so a slow reader isn't auto-skipped mid-read. Because
 *    that listener is on `window`, activity anywhere (e.g. typing in the copilot
 *    panel) also resets it.
 * Both exceptions can otherwise defer recovery indefinitely for a genuinely-dead
 * anchor, so ANCHOR_HARD_CAP_MS is an absolute ceiling measured from step start:
 * it fires the same auto-skip regardless of `waitForUserAction` and is NOT reset
 * by activity, guaranteeing every step eventually recovers and stays observable.
 *
 * An element only counts as "found" once it has a real layout box: a
 * present-but-hidden / `display:contents` / zero-size element returns a
 * DOMRect(0,0,0,0) that would draw a broken spotlight pinned to the corner, so we
 * keep polling past it rather than resolving to garbage.
 *
 * Several anchors are intentionally placed on more than one node (e.g. a control
 * that appears in both a toolbar and an empty-state), so we scan ALL matches and
 * take the first with a real box — never assume the first `querySelector` hit is
 * the visible one (a hidden instance may precede it in the DOM).
 */
const GLUE_INTERVAL_MS = 250
const NOT_FOUND_FAST_POLL_WINDOW_MS = 1000
const NOT_FOUND_THROTTLE_MS = 250
/** Give up on a not-yet-mounted anchor after this long and signal the caller. */
export const ANCHOR_NOT_FOUND_TIMEOUT_MS = 8000
/**
 * Absolute ceiling measured from step start. Unlike the soft timeout it fires
 * regardless of `waitForUserAction` and is never reset by user activity, so a
 * genuinely dead anchor always recovers (auto-skip) and stays observable
 * (guide_anchor_not_found) instead of being deferred indefinitely.
 */
export const ANCHOR_HARD_CAP_MS = 180000

export function useAnchorRect(
  anchorId: string | undefined,
  enabled: boolean,
  waitForUserAction?: boolean
): AnchorRectState {
  const [state, setState] = useState<AnchorRectState>({ rect: null, found: false, timedOut: false })

  useEffect(() => {
    if (!enabled || !anchorId) {
      setState({ rect: null, found: false, timedOut: false })
      return
    }

    const selector = `[${ONBOARDING_ATTR}="${anchorId}"]`
    let stopped = false
    let raf = 0
    let notFoundTimer = 0
    let pollStartedAt = 0
    // Absolute step-start time for the hard cap — never reset by activity or
    // by a box-loss re-acquire (unlike pollStartedAt).
    let stepStartedAt = 0
    let foundEl: HTMLElement | null = null
    let glueCleanup: () => void = () => {}
    let stopActivityListeners: () => void = () => {}
    // Last emitted rect — only setState (→ re-render the overlay) when the box
    // actually changes, so a static highlight doesn't re-render on every re-measure.
    let last: { x: number; y: number; w: number; h: number } | null = null

    // A layout box alone is not enough to spotlight an element. An off-canvas
    // drawer keeps its box while translated out of view, and the product menu
    // keeps its box under the copilot sheet at narrow widths — both were
    // "found" and ringed UI the user couldn't see or click (observed live:
    // create-table step 1 spotlighted the menu's New table button THROUGH the
    // copilot panel). So additionally require:
    //  - the box intersects the viewport (a legit below-the-fold anchor is
    //    simply found once the user scrolls it into view — the fallback
    //    bubble's copy already says exactly that), and
    //  - nothing unrelated covers its center (elementFromPoint skips
    //    pointer-events:none nodes, so our own dim/spotlight never counts as
    //    cover; under a Radix modal this also parks page anchors — correct,
    //    since spotlighting THROUGH a modal is the same wrong highlight —
    //    while anchors INSIDE the open dialog still hit-test to themselves).
    const hasBox = (el: HTMLElement, r: DOMRect) => {
      if (el.getClientRects().length === 0 || (r.width <= 0 && r.height <= 0)) return false
      if (
        r.right <= 0 ||
        r.bottom <= 0 ||
        r.left >= window.innerWidth ||
        r.top >= window.innerHeight
      ) {
        return false
      }
      if (typeof document.elementFromPoint === 'function') {
        try {
          const cover = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          // null (no layout engine / point outside) is treated as visible.
          if (cover && !el.contains(cover) && !cover.contains(el)) return false
        } catch {
          // jsdom without elementFromPoint support — skip the occlusion check.
        }
      }
      return true
    }

    // Scan every match and take the first with a real layout box.
    const findEl = (): HTMLElement | null => {
      for (const candidate of document.querySelectorAll<HTMLElement>(selector)) {
        if (hasBox(candidate, candidate.getBoundingClientRect())) return candidate
      }
      return null
    }

    const measure = () => {
      if (stopped || !foundEl) return
      const r = foundEl.getBoundingClientRect()
      if (!hasBox(foundEl, r)) {
        // The anchor lost its box (unmounted / hidden / navigated away): drop the
        // glue and go back to polling so we re-acquire it when it reappears.
        glueCleanup()
        glueCleanup = () => {}
        foundEl = null
        last = null
        setState({ rect: null, found: false, timedOut: false })
        startPolling()
        return
      }
      const moved =
        !last || last.x !== r.x || last.y !== r.y || last.w !== r.width || last.h !== r.height
      if (moved) {
        last = { x: r.x, y: r.y, w: r.width, h: r.height }
        setState({ rect: r, found: true, timedOut: false })
      }
    }

    const onFound = (el: HTMLElement) => {
      stopActivityListeners()
      foundEl = el
      last = null
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
      const onScrollResize = () => measure()
      window.addEventListener('scroll', onScrollResize, true)
      window.addEventListener('resize', onScrollResize)
      const interval = window.setInterval(measure, GLUE_INTERVAL_MS)
      glueCleanup = () => {
        window.removeEventListener('scroll', onScrollResize, true)
        window.removeEventListener('resize', onScrollResize)
        window.clearInterval(interval)
      }
      measure()
    }

    // Non-`waitForUserAction` steps only: a genuine user interaction (reading,
    // scrolling, clicking around while waiting) restarts the not-found clock so a
    // slow reader isn't auto-skipped mid-read. Throttled to the same ~4fps cadence
    // as the poll itself so a held pointer/key can't reset it every frame.
    // `waitForUserAction` steps don't need this — they never time out at all (see
    // the giveup check in poll() below), since the engine doesn't navigate/act for
    // them and the anchor legitimately may not mount until the user gets there.
    const armActivityListeners = () => {
      if (waitForUserAction) return
      let lastReset = 0
      const onActivity = () => {
        const now = performance.now()
        if (now - lastReset < NOT_FOUND_THROTTLE_MS) return
        lastReset = now
        pollStartedAt = now
      }
      window.addEventListener('pointerdown', onActivity)
      window.addEventListener('keydown', onActivity)
      stopActivityListeners = () => {
        window.removeEventListener('pointerdown', onActivity)
        window.removeEventListener('keydown', onActivity)
        stopActivityListeners = () => {}
      }
    }

    const poll = () => {
      if (stopped) return
      const el = findEl()
      if (el) {
        onFound(el) // stop polling — glue takes over
        return
      }
      const now = performance.now()
      if (now - stepStartedAt >= ANCHOR_HARD_CAP_MS) {
        // Absolute ceiling: fires regardless of waitForUserAction and is not
        // reset by activity, so a genuinely dead anchor always recovers and
        // stays observable — the caller routes `timedOut` through
        // guide_anchor_not_found + guide_skipped.
        setState({ rect: null, found: false, timedOut: true })
        stopActivityListeners()
        return
      }
      const elapsed = now - pollStartedAt
      if (!waitForUserAction && elapsed >= ANCHOR_NOT_FOUND_TIMEOUT_MS) {
        // Give up for good — no further raf/timer is scheduled. The caller
        // reacts to `timedOut` (e.g. auto-advance past this step); if a new
        // anchorId/enabled comes in, the effect re-runs and starts fresh.
        setState({ rect: null, found: false, timedOut: true })
        stopActivityListeners()
        return
      }
      if (elapsed < NOT_FOUND_FAST_POLL_WINDOW_MS) {
        raf = requestAnimationFrame(poll)
      } else {
        // Throttle to ~4fps once the fast window has elapsed, so a target that
        // legitimately never mounts doesn't busy-poll every frame.
        notFoundTimer = window.setTimeout(() => {
          raf = requestAnimationFrame(poll)
        }, NOT_FOUND_THROTTLE_MS)
      }
    }
    const startPolling = () => {
      pollStartedAt = performance.now()
      armActivityListeners()
      raf = requestAnimationFrame(poll)
    }
    stepStartedAt = performance.now()
    startPolling()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      window.clearTimeout(notFoundTimer)
      glueCleanup()
      stopActivityListeners()
    }
  }, [anchorId, enabled, waitForUserAction])

  return state
}
