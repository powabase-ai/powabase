import { describe, expect, it } from 'vitest'
import {
  BUBBLE_WIDTH,
  computeBubblePosition,
  GAP,
} from '../GuideBubbleOverlay'

/**
 * Regression (seen live on create-table steps 3-4): `placement: 'top'` set the
 * bubble's TOP edge at `rect.top - GAP`, so the ~160px card grew DOWNWARD
 * across the anchor it was pointing at — covering the very control the step
 * says to click. The maths must be height-aware: 'top' subtracts the measured
 * card height, and both vertical placements flip when they don't fit, instead
 * of clamping the card over the anchor or off the fold.
 */

const HEIGHT = 160

const rect = (x: number, y: number, w: number, h: number): DOMRect =>
  ({
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  }) as DOMRect

describe('computeBubblePosition', () => {
  it('places a top bubble fully ABOVE the anchor, not over it', () => {
    const anchor = rect(100, 500, 120, 40)
    const { top } = computeBubblePosition(anchor, 'top', HEIGHT)
    // Bottom edge of the bubble sits GAP above the anchor's top edge.
    expect(top + HEIGHT).toBe(anchor.top - GAP)
  })

  it('flips a top bubble below the anchor when there is no headroom', () => {
    const anchor = rect(100, 40, 120, 40) // near the viewport top
    const { top } = computeBubblePosition(anchor, 'top', HEIGHT)
    expect(top).toBe(anchor.bottom + GAP)
  })

  it('flips a bottom bubble above the anchor when it would cross the fold', () => {
    const anchor = rect(100, window.innerHeight - 60, 120, 40)
    const { top } = computeBubblePosition(anchor, 'bottom', HEIGHT)
    expect(top + HEIGHT).toBeLessThanOrEqual(anchor.top - GAP + 0.001)
    expect(top).toBeGreaterThanOrEqual(8)
  })

  it('keeps side placements fully inside the viewport vertically', () => {
    const anchor = rect(400, window.innerHeight - 20, 120, 40)
    const { top } = computeBubblePosition(anchor, 'right', HEIGHT)
    expect(top + HEIGHT).toBeLessThanOrEqual(window.innerHeight - 8)
  })

  it('flips a right bubble to the left when it would overflow the right edge', () => {
    const anchor = rect(window.innerWidth - 100, 300, 80, 40)
    const { left } = computeBubblePosition(anchor, 'right', HEIGHT)
    expect(left + BUBBLE_WIDTH).toBeLessThanOrEqual(anchor.left - GAP + 0.001)
  })

  it('flips a left bubble to the right when it would underflow the left edge', () => {
    const anchor = rect(20, 300, 80, 40)
    const { left } = computeBubblePosition(anchor, 'left', HEIGHT)
    expect(left).toBe(anchor.right + GAP)
  })
})
