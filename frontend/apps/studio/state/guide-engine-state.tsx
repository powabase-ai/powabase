/**
 * Guide-bubble engine state.
 *
 * A module-level valtio proxy (created once, outside React — same pattern as
 * `sidebar-manager-state.tsx`) so an in-flight walkthrough survives the page
 * remount that happens on `router.push` between project tabs. The store only
 * tracks WHICH step is active; navigation + DOM anchoring live in the overlay's
 * driver hook (which has access to the router), so this file has no React/router
 * imports.
 */
import { proxy, useSnapshot } from 'valtio'

import { getSequence } from '@/components/interfaces/AI/GuideBubbles/guide-sequences'
import type {
  GuideFinishedEvent,
  GuideSkippedEvent,
  GuideStartedEvent,
  GuideStepViewedEvent,
} from 'common/telemetry-constants'

export type GuideEngineStatus =
  | 'idle'
  | 'navigating'
  | 'waiting_for_anchor'
  | 'showing'

interface GuideEngineData {
  activeSequenceId: string | undefined
  stepIndex: number
  status: GuideEngineStatus
}

interface GuideEngineState extends GuideEngineData {
  start: (sequenceId: string, source?: 'copilot' | 'welcome' | 'replay') => void
  next: (opts?: { reason?: 'anchor_timeout' }) => void
  back: () => void
  skip: () => void
  finish: () => void
  setStatus: (s: GuideEngineStatus) => void
}

const INITIAL: GuideEngineData = {
  activeSequenceId: undefined,
  stepIndex: 0,
  status: 'idle',
}

// Guide lifecycle telemetry (guide_started / guide_step_viewed / guide_skipped /
// guide_finished). This store is intentionally React/router-free (see file
// header), so it can't call the `useTrack` hook itself — GuideBubbleOverlay
// (which has hook access) registers a handler on mount and tears it down on
// unmount. Emitting is a no-op until that registration happens.
type GuideLifecycleEvent =
  | Omit<GuideStartedEvent, 'groups'>
  | Omit<GuideStepViewedEvent, 'groups'>
  | Omit<GuideSkippedEvent, 'groups'>
  | Omit<GuideFinishedEvent, 'groups'>

let telemetryHandler: ((event: GuideLifecycleEvent) => void) | undefined

export const setGuideTelemetryHandler = (
  handler: ((event: GuideLifecycleEvent) => void) | undefined
) => {
  telemetryHandler = handler
}

const emitStepViewed = (sequenceId: string, stepIndex: number) => {
  const step = getSequence(sequenceId)?.steps[stepIndex]
  if (!step) return
  telemetryHandler?.({
    action: 'guide_step_viewed',
    properties: { sequence_id: sequenceId, step_index: stepIndex, anchor_id: step.anchor },
  })
}

export const guideEngineState = proxy<GuideEngineState>({
  ...INITIAL,

  start(sequenceId: string, source = 'copilot') {
    if (!getSequence(sequenceId)) return
    guideEngineState.activeSequenceId = sequenceId
    guideEngineState.stepIndex = 0
    guideEngineState.status = 'navigating'
    telemetryHandler?.({ action: 'guide_started', properties: { sequence_id: sequenceId, source } })
    emitStepViewed(sequenceId, 0)
  },

  next(opts?: { reason?: 'anchor_timeout' }) {
    const sequenceId = guideEngineState.activeSequenceId ?? ''
    const seq = getSequence(sequenceId)
    if (!seq) return
    if (guideEngineState.stepIndex >= seq.steps.length - 1) {
      // Reaching the end via Next/Done is the one true "completion" path —
      // skip() also routes through finish() below but emits guide_skipped
      // instead, so finish() itself stays a silent teardown shared by both.
      // An anchor-timeout auto-skip landing on the last step is NOT a real
      // completion either (the walkthrough never actually showed that step) —
      // route it through guide_skipped too, so a broken guide never gets
      // misreported as guide_finished.
      telemetryHandler?.(
        opts?.reason === 'anchor_timeout'
          ? {
              action: 'guide_skipped',
              properties: { sequence_id: sequenceId, step_index: guideEngineState.stepIndex },
            }
          : { action: 'guide_finished', properties: { sequence_id: sequenceId } }
      )
      guideEngineState.finish()
      return
    }
    guideEngineState.stepIndex += 1
    guideEngineState.status = 'navigating'
    emitStepViewed(sequenceId, guideEngineState.stepIndex)
  },

  back() {
    if (guideEngineState.stepIndex <= 0) return
    guideEngineState.stepIndex -= 1
    guideEngineState.status = 'navigating'
    if (guideEngineState.activeSequenceId) {
      emitStepViewed(guideEngineState.activeSequenceId, guideEngineState.stepIndex)
    }
  },

  skip() {
    if (guideEngineState.activeSequenceId) {
      telemetryHandler?.({
        action: 'guide_skipped',
        properties: {
          sequence_id: guideEngineState.activeSequenceId,
          step_index: guideEngineState.stepIndex,
        },
      })
    }
    guideEngineState.finish()
  },

  finish() {
    guideEngineState.activeSequenceId = undefined
    guideEngineState.stepIndex = 0
    guideEngineState.status = 'idle'
  },

  setStatus(s: GuideEngineStatus) {
    guideEngineState.status = s
  },
})

export const useGuideEngineSnapshot = () => useSnapshot(guideEngineState)
