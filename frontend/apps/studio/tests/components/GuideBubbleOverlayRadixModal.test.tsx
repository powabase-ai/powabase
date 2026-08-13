/**
 * Regression: the guide bubble must survive a Radix modal opening mid-step.
 *
 * Smoke finding (2026-08-12, connect walkthrough): a `waitForUserAction` step
 * has the user click a control that opens a Radix Dialog in modal mode. The
 * dialog's DismissableLayer sets `body { pointer-events: none }` and treats any
 * pointerdown outside its own layer/branches as `pointerDownOutside`. The
 * bubble is portaled straight onto document.body, so it was (a) mouse-inert
 * (inherited pointer-events: none) and (b) "outside" — pressing its Done button
 * closed the MODAL instead of advancing the guide, deadlocking the step until
 * the 180s hard cap.
 *
 * The fix registers the bubble as a DismissableLayerBranch (so Radix layers
 * treat presses on it as inside) and re-enables pointer events on the wrapper.
 * jsdom cannot hit-test pointer-events, so that half is pinned by asserting the
 * wrapper's style; the branch registration is pinned behaviourally.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent } from 'ui'

vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/project/[ref]/editor', push: vi.fn().mockResolvedValue(true) }),
}))
vi.mock('common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('common')>()),
  useParams: () => ({ ref: 'test-ref' }),
}))
vi.mock('@/lib/telemetry/track', () => ({ useTrack: () => vi.fn() }))
vi.mock('@/hooks/misc/useGuideFeatureGates', () => ({ useGuideFeatureGates: () => ({}) }))

import { GuideBubbleOverlay } from '@/components/interfaces/AI/GuideBubbles/GuideBubbleOverlay'
import { guideEngineState } from '@/state/guide-engine-state'

// Radix's DismissableLayer attaches its document pointerdown listener in a
// setTimeout(0) after mount (so the opening click can't instantly dismiss);
// flush that before dispatching pointer events.
const flushRadixListeners = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 10))
  })

const renderModalAndOverlay = () => {
  const onOpenChange = vi.fn()
  render(
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent aria-label="Connect your project">
          <p>Connect modal body</p>
        </DialogContent>
      </Dialog>
      <GuideBubbleOverlay />
      <div data-testid="genuinely-outside">outside</div>
    </>
  )
  // Single-step sequence, so the bubble's primary button reads "Done".
  act(() => guideEngineState.start('connect', 'copilot'))
  return { onOpenChange }
}

describe('GuideBubbleOverlay under a Radix modal', () => {
  beforeEach(() => {
    act(() => guideEngineState.finish())
    document.body.style.pointerEvents = ''
  })

  it('control: a pointerdown genuinely outside the dialog still dismisses it', async () => {
    // Validates the harness — without this, the "bubble does not dismiss"
    // assertions below could pass vacuously if jsdom never exercised Radix's
    // outside-press path at all.
    const { onOpenChange } = renderModalAndOverlay()
    await flushRadixListeners()

    fireEvent.pointerDown(screen.getByTestId('genuinely-outside'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('pressing the bubble does NOT dismiss the modal, and Done advances the guide', async () => {
    const { onOpenChange } = renderModalAndOverlay()
    await flushRadixListeners()

    // hidden: true — Radix's hideOthers may aria-hide the portaled bubble.
    const doneButton = screen.getByRole('button', { name: 'Done', hidden: true })
    fireEvent.pointerDown(doneButton)
    fireEvent.click(doneButton)

    expect(onOpenChange).not.toHaveBeenCalled()
    // Done on the last step finishes the walkthrough.
    expect(guideEngineState.activeSequenceId).toBeUndefined()
    expect(guideEngineState.status).toBe('idle')
  })

  it('re-enables pointer events on the bubble while the modal disables them on body', async () => {
    renderModalAndOverlay()
    await flushRadixListeners()

    // The modal's DismissableLayer really did neutralise the body…
    expect(document.body.style.pointerEvents).toBe('none')

    // …so the bubble's wrapper must opt back in, or every control in it is
    // mouse-inert (jsdom can't hit-test this; pin the style contract instead).
    const doneButton = screen.getByRole('button', { name: 'Done', hidden: true })
    const bubble = doneButton.closest('[role="dialog"]') as HTMLElement
    const wrapper = bubble.parentElement as HTMLElement
    expect(wrapper.style.pointerEvents).toBe('auto')
  })
})
