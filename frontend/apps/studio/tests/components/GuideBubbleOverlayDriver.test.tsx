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
let rejectPush: ((reason?: unknown) => void) | undefined
const mockPush = vi.fn(
  () =>
    new Promise<boolean>((resolve, reject) => {
      resolvePush = () => resolve(true)
      // Real rejection source in this codebase: usePreventNavigationOnUnsavedChanges
      // throws 'Route change declined' in a routeChangeStart handler.
      rejectPush = (reason: unknown = 'Route change declined') => reject(reason)
    })
)
// vi.hoisted: the `ui` package imports sonner at module load, so the mock
// factory runs before this file's const initializers.
const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }))
vi.mock('sonner', () => ({ toast: mockToast }))

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
import { GUIDE_SEQUENCES } from '@/components/interfaces/AI/GuideBubbles/guide-sequences'
import { ONBOARDING_ATTR } from '@/components/interfaces/AI/GuideBubbles/onboarding-anchors'
import { guideEngineState } from '@/state/guide-engine-state'

// Track manually-mounted DOM (anchors, decoys) and remove ONLY those in
// afterEach — wiping document.body would race RTL's own cleanup unmounting
// the portal ("The node to be removed is not a child of this node").
const mountedNodes: HTMLElement[] = []
const mountNode = (el: HTMLElement) => {
  document.body.appendChild(el)
  mountedNodes.push(el)
  return el
}
const mountAnchor = (anchorId: string) => {
  const el = document.createElement('button')
  el.setAttribute(ONBOARDING_ATTR, anchorId)
  return mountNode(el)
}

describe('GuideBubbleOverlay driver effect', () => {
  beforeEach(() => {
    act(() => guideEngineState.finish())
    mockRef = 'test-ref'
    mockPathname = '/project/[ref]/editor'
    resolvePush = undefined
    rejectPush = undefined
    mockPush.mockClear()
    mockTrack.mockClear()
    mockToast.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const el of mountedNodes.splice(0)) el.remove()
  })

  it('advances when the user clicks the anchor of a click-instruction step', async () => {
    // "Click New query to open a blank editor" — doing the thing IS the Next.
    const step0 = GUIDE_SEQUENCES['sql-query'].steps[0]
    expect(step0.advanceOnAnchorClick).toBe(true)
    mockPathname = step0.route! // already there — no navigation involved
    const anchor = mountAnchor(step0.anchor)

    render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('sql-query', 'copilot')
    })
    expect(guideEngineState.stepIndex).toBe(0)

    await act(async () => {
      anchor.click()
    })
    expect(guideEngineState.stepIndex).toBe(1)
  })

  it('does not advance on anchor clicks for steps without the flag', async () => {
    // manage-compute step 0 highlights the current tier — informational, and
    // clicking around inside it must not advance/finish the walkthrough.
    const step0 = GUIDE_SEQUENCES['manage-compute'].steps[0]
    expect(step0.advanceOnAnchorClick).toBeUndefined()
    mockPathname = step0.route!
    const anchor = mountAnchor(step0.anchor)

    render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('manage-compute', 'copilot')
    })

    await act(async () => {
      anchor.click()
    })
    expect(guideEngineState.stepIndex).toBe(0)
    expect(guideEngineState.activeSequenceId).toBe('manage-compute')
  })

  it('does not advance on clicks elsewhere during a click-instruction step', async () => {
    const step0 = GUIDE_SEQUENCES['sql-query'].steps[0]
    mockPathname = step0.route!
    mountAnchor(step0.anchor)
    const elsewhere = mountNode(document.createElement('button'))

    render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('sql-query', 'copilot')
    })

    await act(async () => {
      elsewhere.click()
    })
    expect(guideEngineState.stepIndex).toBe(0)
  })

  it('finishes the walkthrough when the clicked anchor belongs to the last step', async () => {
    // Single-step connect guide: clicking the Connect button completes it —
    // the bubble is gone BEFORE the modal opens instead of lingering under it.
    const step0 = GUIDE_SEQUENCES['connect'].steps[0]
    expect(step0.advanceOnAnchorClick).toBe(true)
    const anchor = mountAnchor(step0.anchor)

    render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('connect', 'copilot')
    })

    await act(async () => {
      anchor.click()
    })
    expect(guideEngineState.status).toBe('idle')
    expect(mockTrack).toHaveBeenCalledWith(
      'guide_finished',
      expect.objectContaining({ sequence_id: 'connect' })
    )
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

  it('skips the walkthrough when the user declines the navigation', async () => {
    // usePreventNavigationOnUnsavedChanges blocks route changes by THROWING in
    // routeChangeStart, so router.push rejects. Advancing to anchor-waiting on
    // the page the user refused to leave would burn the 8s clock against the
    // wrong page — and the rejection must not escape as an unhandled error.
    mockPathname = '/project/[ref]/sources'
    render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('create-table', 'copilot')
    })
    expect(guideEngineState.status).toBe('navigating')

    await act(async () => {
      rejectPush!()
      await Promise.resolve()
    })
    expect(guideEngineState.status).toBe('idle')
    expect(guideEngineState.activeSequenceId).toBeUndefined()
    expect(mockTrack).toHaveBeenCalledWith(
      'guide_skipped',
      expect.objectContaining({ sequence_id: 'create-table' })
    )
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/declined/i))
  })

  it('skips quietly (no "declined" toast) when the push was superseded by another navigation', async () => {
    // Next rejects a route change cancelled by a NEWER navigation with an
    // error carrying `cancelled: true` — the user went somewhere else, they
    // didn't decline anything, so the declined copy would be wrong.
    mockPathname = '/project/[ref]/sources'
    render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('create-table', 'copilot')
    })

    await act(async () => {
      rejectPush!(Object.assign(new Error('Route Cancelled'), { cancelled: true }))
      await Promise.resolve()
    })
    expect(guideEngineState.status).toBe('idle')
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('drops a settled push transition after the user skipped mid-navigation (stale guard)', async () => {
    // The stale guard is load-bearing in both settle branches: without it, a
    // push resolving AFTER skip() would setStatus('waiting_for_anchor') on an
    // idle engine, polluting the state for the next start().
    mockPathname = '/project/[ref]/sources'
    render(<GuideBubbleOverlay />)
    await act(async () => {
      guideEngineState.start('create-table', 'copilot')
    })
    expect(mockPush).toHaveBeenCalled()

    await act(async () => {
      guideEngineState.skip()
    })
    expect(guideEngineState.status).toBe('idle')

    await act(async () => {
      resolvePush!()
      await Promise.resolve()
    })
    expect(guideEngineState.status).toBe('idle')
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
