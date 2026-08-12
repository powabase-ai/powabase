/**
 * Guide-bubble overlay — the visual layer for an active walkthrough.
 *
 * Mounted ONCE at DefaultLayout level (so it survives page remounts on
 * `router.push` between tabs) and portaled to document.body above the project
 * sidebar (which renders at z-50). It reads the module-level guide engine, drives cross-tab navigation to
 * each step's route, resolves the step's anchor to a live rect, and renders a
 * dim+spotlight mask plus a bubble card. The copilot panel stays mounted/visible
 * throughout because neither it nor this overlay live inside the routed page.
 */
import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer'
import { useParams } from 'common'
import { useRouter } from 'next/router'
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from 'ui'
import { useTrack } from '@/lib/telemetry/track'
import {
  guideEngineState,
  setGuideTelemetryHandler,
  useGuideEngineSnapshot,
} from '@/state/guide-engine-state'
import { getSequence, type GuidePlacement } from './guide-sequences'
import { useAnchorRect } from './useAnchorRect'
import { useGuideFeatureGates } from '@/hooks/misc/useGuideFeatureGates'

const BUBBLE_WIDTH = 320
const GAP = 12

/**
 * How long the engine may sit in 'navigating' waiting for `useParams().ref`
 * to resolve before the walkthrough is skipped. Long enough for any real tab
 * transition; short enough that a walkthrough launched outside a project
 * scope doesn't leave a parked bubble with no timeout running.
 */
export const NAVIGATING_NO_REF_TIMEOUT_MS = 10000

/**
 * Everything this overlay portals to document.body goes inside a Radix
 * DismissableLayerBranch with pointer events re-enabled. A `waitForUserAction`
 * step often has the user open a Radix dialog/side-panel in MODAL mode, whose
 * DismissableLayer (the same module instance backing the `ui` Dialog) sets
 * `body { pointer-events: none }` and dismisses on any pointerdown outside its
 * own layer/branches. Without this wrapper the bubble is painted on top but
 * mouse-inert, and a press on its buttons hit-tests through to the dialog
 * overlay — Radix reads it as pointerDownOutside and closes the MODAL, so the
 * step can deadlock until the anchor hard cap (seen live on the connect
 * walkthrough). Registering as a branch makes presses on the bubble "inside";
 * `pointerEvents: 'auto'` opts it back in under the neutralised body. The
 * spotlight svg stays pointer-events-none via its own class.
 *
 * KNOWN LIMITATION — mouse only. While a modal is open, Radix's `hideOthers`
 * still marks the bubble `aria-hidden` and its FocusScope keeps Tab inside the
 * dialog, so keyboard and screen-reader users cannot reach the bubble until
 * the modal closes. Fixing that means portaling into the dialog's own
 * container (per-dialog wiring) or an aria-hidden exemption — out of scope
 * here; the deadlock this wrapper fixes was the mouse path.
 *
 * The `@radix-ui/react-dismissable-layer` dependency is pinned EXACTLY (no
 * caret): `ui`'s Dialog pins 1.1.11 hard via @radix-ui/react-dialog, and a
 * caret here could resolve a newer patch → two module instances → two branch
 * registries → this deadlock silently returns (the RadixModal test would
 * catch it, but keep the versions converged in the first place).
 */
const GuideBranch = ({ children }: { children: ReactNode }) => (
  <DismissableLayerBranch style={{ pointerEvents: 'auto' }}>{children}</DismissableLayerBranch>
)

function computeBubblePosition(rect: DOMRect, placement: GuidePlacement = 'bottom') {
  let top: number
  let left: number
  switch (placement) {
    case 'top':
      top = rect.top - GAP
      left = rect.left
      break
    case 'left':
      top = rect.top
      left = rect.left - BUBBLE_WIDTH - GAP
      break
    case 'right':
      top = rect.top
      left = rect.right + GAP
      break
    case 'bottom':
    default:
      top = rect.bottom + GAP
      left = rect.left
      break
  }
  // Clamp into the viewport with an 8px margin.
  const maxLeft = window.innerWidth - BUBBLE_WIDTH - 8
  left = Math.max(8, Math.min(left, maxLeft))
  top = Math.max(8, Math.min(top, window.innerHeight - 8))
  return { top, left }
}

export const GuideBubbleOverlay = () => {
  const router = useRouter()
  const { ref } = useParams()
  const { activeSequenceId, stepIndex, status } = useGuideEngineSnapshot()
  const track = useTrack()

  const sequence = getSequence(activeSequenceId ?? '')
  const step = sequence?.steps[stepIndex]

  const gates = useGuideFeatureGates()
  const gateBlocked = !!sequence?.featureGate && gates[sequence.featureGate] === false

  // guide-engine-state is intentionally React/router-free, so it can't call
  // useTrack itself — register this overlay's track() as the handler for the
  // guide_started/guide_step_viewed/guide_skipped/guide_finished lifecycle
  // events it emits.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGuideTelemetryHandler((event) => track(event.action as any, event.properties as any))
    return () => setGuideTelemetryHandler(undefined)
  }, [track])

  // Driver: when a new step becomes active, navigate to its route (if needed),
  // then wait for the anchor to mount. `ref` is in the deps so that if it's
  // momentarily undefined during a tab transition, the navigation retries once
  // it resolves (rather than silently waiting on the wrong page).
  useEffect(() => {
    if (gateBlocked) return
    if (status !== 'navigating' || !step || !ref) return
    if (step.route && !step.waitForUserAction && router.pathname !== step.route) {
      // Enter the anchor phase only once the navigation SUCCEEDS —
      // useAnchorRect's 8s not-found clock starts when the phase does, and
      // starting it against the OLD page burns the whole window on a slow
      // load: step 0 auto-skips into a waitForUserAction step with no route
      // and no soft timeout (unrecoverable until the hard cap). A REJECTED
      // push means the user declined the navigation (this codebase blocks
      // route changes by throwing in routeChangeStart — see
      // usePreventNavigationOnUnsavedChanges): don't start hunting anchors on
      // the page they refused to leave; end the walkthrough observably. The
      // stale guard drops either transition if the step/ref changed (or the
      // user skipped) while the push was in flight.
      let stale = false
      router.push(step.route.replace('[ref]', ref as string)).then(
        () => {
          if (!stale) guideEngineState.setStatus('waiting_for_anchor')
        },
        () => {
          if (stale) return
          import('sonner')
            .then(({ toast }) => toast('Navigation was declined — ending the walkthrough.'))
            .catch(() => {})
          guideEngineState.skip()
        }
      )
      return () => {
        stale = true
      }
    }
    guideEngineState.setStatus('waiting_for_anchor')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeSequenceId, stepIndex, ref, gateBlocked])

  // Backstop for the `!ref` wait above: `ref` being momentarily undefined is a
  // normal tab transition and the driver retries when it resolves — but if it
  // NEVER resolves (the user left the project scope entirely), the engine
  // would park in 'navigating' with no timeout running (the anchor hard cap
  // only starts with the anchor phase). End the walkthrough observably instead:
  // skip() emits guide_skipped, and the toast says why the bubble went away.
  useEffect(() => {
    if (gateBlocked || status !== 'navigating' || !step || ref) return
    const timer = window.setTimeout(() => {
      import('sonner')
        .then(({ toast }) => toast("Couldn't find the page for this walkthrough — ending it."))
        .catch(() => {})
      guideEngineState.skip()
    }, NAVIGATING_NO_REF_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeSequenceId, stepIndex, ref, gateBlocked])

  const anchorEnabled = !gateBlocked && (status === 'waiting_for_anchor' || status === 'showing')
  const { rect, found, timedOut } = useAnchorRect(step?.anchor, anchorEnabled, step?.waitForUserAction)

  useEffect(() => {
    if (found && status === 'waiting_for_anchor') guideEngineState.setStatus('showing')
  }, [found, status])

  // Small "moving on" affordance shown in the next step's bubble after an
  // anchor-timeout auto-skip, instead of silently jumping. Cleared once that
  // next step's anchor is actually found. (useAnchorRect never times out
  // waitForUserAction steps, so `timedOut` can only fire for the other kind.)
  const [autoSkipNotice, setAutoSkipNotice] = useState(false)

  // The anchor never mounted within useAnchorRect's bounded timeout: rather
  // than sit on a blank spotlight forever, log it, tell the user, and
  // auto-advance. Passing reason: 'anchor_timeout' means an auto-skip that
  // lands on the LAST step emits guide_skipped instead of guide_finished — a
  // broken guide should never be misreported as a real completion.
  useEffect(() => {
    if (!timedOut || !sequence || !step) return
    track('guide_anchor_not_found', {
      sequence_id: sequence.id,
      step_index: stepIndex,
      anchor_id: step.anchor,
    })
    const isLastStep = stepIndex >= sequence.steps.length - 1
    if (isLastStep) {
      // The walkthrough ends right here (finish() clears the active sequence),
      // so there's no next bubble to show an inline notice in — toast instead.
      import('sonner')
        .then(({ toast }) => toast("Couldn't find that control — ending the walkthrough."))
        .catch(() => {})
    } else {
      setAutoSkipNotice(true)
    }
    guideEngineState.next({ reason: 'anchor_timeout' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedOut])

  useEffect(() => {
    if (status === 'showing') setAutoSkipNotice(false)
  }, [status])

  // Dismissal is via the Skip button. We intentionally do NOT bind a global
  // Escape handler: a waitForUserAction step often has the user open a Radix
  // dialog/side-panel, and Escape there (to close it) would otherwise also end
  // the walkthrough.

  if (gateBlocked && sequence) {
    if (typeof document === 'undefined') return null
    return createPortal(
      <GuideBranch>
        <div
          className="fixed left-1/2 top-24 -translate-x-1/2 bg-overlay border border-overlay rounded-md shadow-lg p-4 flex flex-col gap-y-2"
          style={{ width: BUBBLE_WIDTH, zIndex: 71 }}
          role="dialog"
          aria-label={sequence.title}
        >
          <p className="text-sm text-foreground font-medium">{sequence.title}</p>
          <p className="text-sm text-foreground-light">
            This feature isn’t enabled in your project, so this walkthrough isn’t available.
          </p>
          <div className="flex justify-end pt-1">
            <Button type="primary" size="tiny" onClick={() => guideEngineState.finish()}>
              Got it
            </Button>
          </div>
        </div>
      </GuideBranch>,
      document.body
    )
  }

  if (!sequence || !step || status === 'idle') return null
  if (typeof document === 'undefined') return null

  const isLast = stepIndex >= sequence.steps.length - 1
  // Show the step's instruction as soon as the step is active. Once the anchor has a
  // real rect we pin the bubble to it and draw the spotlight; while still waiting for
  // the anchor to mount (e.g. the user must open a dialog or navigate to a detail
  // page), show the same bubble in a fixed fallback spot so the instruction is
  // visible and the user can act, Skip, or go Back — never a silent blank wait.
  const positioned = status === 'showing' && !!rect
  const bubbleStyle: CSSProperties = positioned
    ? { ...computeBubblePosition(rect as DOMRect, step.placement), width: BUBBLE_WIDTH, zIndex: 71 }
    : { left: '50%', bottom: 24, transform: 'translateX(-50%)', width: BUBBLE_WIDTH, zIndex: 71 }

  return createPortal(
    <GuideBranch>
      {/* Dim + spotlight: pointer-events-none so the highlighted control stays clickable. */}
      {positioned && (
        <svg
          className="fixed inset-0 pointer-events-none"
          style={{ width: '100vw', height: '100vh', zIndex: 70 }}
          aria-hidden
        >
          <defs>
            <mask id="guide-spotlight">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={(rect as DOMRect).x - 8}
                y={(rect as DOMRect).y - 8}
                width={(rect as DOMRect).width + 16}
                height={(rect as DOMRect).height + 16}
                rx={6}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.55)"
            mask="url(#guide-spotlight)"
          />
          <rect
            x={(rect as DOMRect).x - 8}
            y={(rect as DOMRect).y - 8}
            width={(rect as DOMRect).width + 16}
            height={(rect as DOMRect).height + 16}
            rx={6}
            fill="none"
            stroke="hsl(var(--brand-default))"
            strokeWidth={2}
          />
        </svg>
      )}

      {/* Bubble */}
      <div
        className="fixed bg-overlay border border-overlay rounded-md shadow-lg p-4 flex flex-col gap-y-2"
        style={bubbleStyle}
        role="dialog"
        aria-label={step.title}
        aria-describedby="guide-bubble-body"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground font-medium">{step.title}</p>
          <span className="text-xs text-foreground-lighter">
            {stepIndex + 1}/{sequence.steps.length}
          </span>
        </div>
        <p id="guide-bubble-body" className="text-sm text-foreground-light">
          {step.body}
        </p>
        {autoSkipNotice && (
          <p className="text-xs text-warning-600">
            Couldn’t find the previous step’s control — moving on.
          </p>
        )}
        {!positioned && (
          <p className="text-xs text-foreground-lighter">
            Follow the step above — this highlights the control once it’s on screen.
          </p>
        )}
        {step.docsUrl && (
          <a
            href={step.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-brand hover:underline"
          >
            Read docs →
          </a>
        )}
        <div className="flex items-center justify-between pt-1">
          <Button type="text" size="tiny" onClick={() => guideEngineState.skip()}>
            Skip
          </Button>
          <div className="flex items-center gap-x-2">
            {stepIndex > 0 && (
              <Button type="default" size="tiny" onClick={() => guideEngineState.back()}>
                Back
              </Button>
            )}
            <Button type="primary" size="tiny" onClick={() => guideEngineState.next()}>
              {isLast ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </GuideBranch>,
    document.body
  )
}
