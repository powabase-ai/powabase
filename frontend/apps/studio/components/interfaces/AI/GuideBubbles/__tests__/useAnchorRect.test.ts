import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANCHOR_HARD_CAP_MS, ANCHOR_NOT_FOUND_TIMEOUT_MS, useAnchorRect } from '../useAnchorRect'

// The anchor id used throughout never has a matching DOM element, so every
// test here exercises the "not found" polling phase only.
const MISSING_ANCHOR = 'missing-anchor-for-test'

describe('useAnchorRect — not-found timeout', () => {
  let currentTime = 0

  // Advance the fake rAF/setTimeout clock AND the mocked performance.now() in
  // lockstep, so useAnchorRect's `elapsed = performance.now() - pollStartedAt`
  // math reflects the same amount of "time" the fake timers advanced.
  const tick = (ms: number) => {
    currentTime += ms
    vi.advanceTimersByTime(ms)
  }

  beforeEach(() => {
    currentTime = 0
    vi.useFakeTimers()
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('times out a non-waitForUserAction step once ANCHOR_NOT_FOUND_TIMEOUT_MS elapses', () => {
    const { result } = renderHook(() => useAnchorRect(MISSING_ANCHOR, true, false))
    expect(result.current.timedOut).toBe(false)
    act(() => {
      tick(ANCHOR_NOT_FOUND_TIMEOUT_MS + 500)
    })
    expect(result.current.timedOut).toBe(true)
  })

  it('does not hit the soft timeout for a waitForUserAction step (exempt until the hard cap)', () => {
    const { result } = renderHook(() => useAnchorRect(MISSING_ANCHOR, true, true))
    act(() => {
      tick(ANCHOR_NOT_FOUND_TIMEOUT_MS * 3)
    })
    expect(result.current.timedOut).toBe(false)
    expect(result.current.found).toBe(false)
  })

  it('hard-caps a waitForUserAction step at ANCHOR_HARD_CAP_MS so a dead anchor still recovers', () => {
    const { result } = renderHook(() => useAnchorRect(MISSING_ANCHOR, true, true))
    // Well past the soft timeout — still active (waitForUserAction is exempt from it).
    act(() => {
      tick(ANCHOR_NOT_FOUND_TIMEOUT_MS * 3)
    })
    expect(result.current.timedOut).toBe(false)
    // Past the absolute ceiling — a genuinely dead anchor is auto-skipped even on
    // a waitForUserAction step, so it stays observable rather than hanging forever.
    act(() => {
      tick(ANCHOR_HARD_CAP_MS)
    })
    expect(result.current.timedOut).toBe(true)
  })

  it('resets the not-found clock on user activity for a non-waitForUserAction step', () => {
    const { result } = renderHook(() => useAnchorRect(MISSING_ANCHOR, true, false))

    // Get close to, but not past, the timeout.
    act(() => {
      tick(ANCHOR_NOT_FOUND_TIMEOUT_MS - 200)
    })
    expect(result.current.timedOut).toBe(false)

    // A genuine user interaction restarts the clock.
    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })

    // Without the reset, total elapsed since poll start would now be
    // (TIMEOUT - 200) + 300 > TIMEOUT and this step would have timed out.
    // With the reset, only ~300ms have elapsed since the interaction.
    act(() => {
      tick(300)
    })
    expect(result.current.timedOut).toBe(false)
  })
})
