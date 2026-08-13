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

describe('useAnchorRect — visibility', () => {
  // A laid-out box is not enough: an off-canvas drawer keeps its box while
  // translated out of view, and the product menu keeps its box under the
  // copilot sheet at narrow widths — both were "found" and spotlighted UI the
  // user couldn't see or click (observed live: create-table step 1 ringed the
  // menu's New table button THROUGH the copilot panel).
  const ANCHOR = 'visibility-anchor-for-test'
  const originalElementFromPoint = document.elementFromPoint

  const boxedButton = (rect: Partial<DOMRect>) => {
    const el = document.createElement('button')
    el.setAttribute('data-onboarding-id', ANCHOR)
    const full = {
      x: 10, y: 20, width: 100, height: 30,
      top: 20, left: 10, right: 110, bottom: 50,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect
    el.getBoundingClientRect = () => full
    el.getClientRects = () => ({ length: 1 }) as DOMRectList
    el.scrollIntoView = () => {}
    document.body.appendChild(el)
    return el
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.elementFromPoint = originalElementFromPoint
    vi.useRealTimers()
  })

  it('does not resolve an anchor whose center is covered by other UI, and resolves once uncovered', () => {
    const anchor = boxedButton({})
    const cover = document.createElement('div') // e.g. the copilot sheet
    document.body.appendChild(cover)
    let covering = true
    document.elementFromPoint = () => (covering ? cover : anchor)

    const { result } = renderHook(() => useAnchorRect(ANCHOR, true, false))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.found).toBe(false)

    covering = false // the sheet closes
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current.found).toBe(true)
  })

  it('does not resolve an anchor laid out fully outside the viewport (off-canvas)', () => {
    boxedButton({ x: -220, left: -220, right: -120 }) // translated off-canvas left
    const { result } = renderHook(() => useAnchorRect(ANCHOR, true, false))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.found).toBe(false)
  })
})

describe('useAnchorRect — multi-match scan', () => {
  // Several anchors are deliberately mounted on more than one node (e.g.
  // tables.new-table-button lives on both the product-menu button and the
  // NewTab ActionCard). The hook must skip a present-but-boxless match and
  // resolve to the first element with a real layout box — the premise the
  // second-mount-point strategy depends on.
  const MULTI_ANCHOR = 'multi-anchor-for-test'

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('skips a boxless match and resolves to the first element with a real box', () => {
    // First in DOM order: present but boxless (jsdom's default all-zero rect
    // stands in for a hidden/unmounted-menu instance).
    const boxless = document.createElement('button')
    boxless.setAttribute('data-onboarding-id', MULTI_ANCHOR)

    const visible = document.createElement('button')
    visible.setAttribute('data-onboarding-id', MULTI_ANCHOR)
    const rect = {
      x: 10, y: 20, width: 100, height: 30,
      top: 20, left: 10, right: 110, bottom: 50,
      toJSON: () => ({}),
    } as DOMRect
    visible.getBoundingClientRect = () => rect
    visible.getClientRects = () => ({ length: 1 }) as DOMRectList
    visible.scrollIntoView = () => {}

    document.body.append(boxless, visible)

    const { result } = renderHook(() => useAnchorRect(MULTI_ANCHOR, true, false))
    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current.found).toBe(true)
    expect(result.current.rect?.width).toBe(100)
    expect(result.current.rect?.x).toBe(10)
  })
})
