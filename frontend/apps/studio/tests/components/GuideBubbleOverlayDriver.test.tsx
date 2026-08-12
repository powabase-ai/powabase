/**
 * Driver-effect liveness (smoke-test latent risks, 2026-08-12):
 *
 * 1. `router.push` was fire-and-forget: the engine flipped to
 *    `waiting_for_anchor` before the destination rendered, so the 8s anchor
 *    clock started against the OLD page. A slow load auto-skipped step 0 and
 *    landed on a `waitForUserAction` step with no route — unrecoverable until
 *    the 180s hard cap. The anchor phase must not start until navigation
 *    settles.
 *
 * 2. When `useParams().ref` is momentarily undefined the driver effect waits
 *    for it — correct for a tab transition, but if it never resolves (the user
 *    left the project scope) the engine parked in 'navigating' with NO timeout
 *    at all. A bounded backstop must end the walkthrough observably.
 */
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockRef: string | undefined = 'test-ref'
let mockPathname = '/project/[ref]/editor'
let resolvePush: (() => void) | undefined
const mockPush = vi.fn(
  () =>
    new Promise<boolean>((resolve) => {
      resolvePush = () => resolve(true)
    })
)

vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: mockPathname, push: mockPush }),
}))
vi.mock('common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('common')>()),
  useParams: () => ({ ref: mockRef }),
}))
const mockTrack = vi.fn()
vi.mock('@/lib/telemetry/track', () => ({ useTrack: () => mockTrack }))
vi.mock('@/hooks/misc/useGuideFeatureGates', () => ({ useGuideFeatureGates: () => ({}) }))

import {
  GuideBubbleOverlay,
  NAVIGATING_NO_REF_TIMEOUT_MS,
} from '@/components/interfaces/AI/GuideBubbles/GuideBubbleOverlay'
import { guideEngineState } from '@/state/guide-engine-state'

describe('GuideBubbleOverlay driver effect', () => {
  beforeEach(() => {
    act(() => guideEngineState.finish())
    mockRef = 'test-ref'
    mockPathname = '/project/[ref]/editor'
    resolvePush = undefined
    mockPush.mockClear()
    mockTrack.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not start the anchor phase until router.push settles', async () => {
    // create-table step 0 routes to /project/[ref]/editor; start elsewhere so
    // the driver actually navigates.
    mockPathname = '/project/[ref]/sources'
    render(<GuideBubbleOverlay />)
    // async act: valtio notifies subscribers in a microtask, so the overlay
    // only re-renders (and its driver effect only runs) once that flushes.
    await act(async () => {
      guideEngineState.start('create-table', 'copilot')
    })

    // Navigation is in flight — the anchor phase (whose 8s not-found clock
    // starts on entry) must not have begun against the old page.
    expect(mockPush).toHaveBeenCalledWith('/project/test-ref/editor')
    expect(guideEngineState.status).toBe('navigating')

    await act(async () => {
      resolvePush!()
      await Promise.resolve()
    })
    expect(guideEngineState.status).toBe('waiting_for_anchor')
  })

  it('skips the walkthrough after a bounded wait when ref never resolves', async () => {
    vi.useFakeTimers()
    mockRef = undefined
    render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('connect', 'copilot')
    })
    expect(guideEngineState.status).toBe('navigating')

    // Just short of the backstop: still parked, still recoverable by ref resolving.
    act(() => {
      vi.advanceTimersByTime(NAVIGATING_NO_REF_TIMEOUT_MS - 1000)
    })
    expect(guideEngineState.status).toBe('navigating')

    // Past it: the engine must recover observably instead of parking forever.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(guideEngineState.status).toBe('idle')
    expect(guideEngineState.activeSequenceId).toBeUndefined()
    expect(mockTrack).toHaveBeenCalledWith(
      'guide_skipped',
      expect.objectContaining({ sequence_id: 'connect' })
    )
  })

  it('does not fire the backstop when ref resolves in time', async () => {
    vi.useFakeTimers()
    mockRef = undefined
    const { rerender } = render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('connect', 'copilot')
    })

    act(() => {
      vi.advanceTimersByTime(NAVIGATING_NO_REF_TIMEOUT_MS - 1000)
    })
    mockRef = 'test-ref'
    rerender(<GuideBubbleOverlay />)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // connect's step has no route, so a resolved ref moves straight to the
    // anchor phase — and the stale backstop must not kill the walkthrough.
    expect(guideEngineState.status).toBe('waiting_for_anchor')
    expect(guideEngineState.activeSequenceId).toBe('connect')
  })
})
