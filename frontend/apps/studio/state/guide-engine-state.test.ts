import { afterEach, describe, expect, it } from 'vitest'
import { guideEngineState, setGuideTelemetryHandler } from './guide-engine-state'

afterEach(() => {
  setGuideTelemetryHandler(undefined)
  guideEngineState.finish()
})

describe('anchor-timeout advance', () => {
  it('emits guide_skipped, not guide_finished, when it runs off the last step', () => {
    // A bounded auto-skip that exhausts the sequence is a BROKEN guide, not a
    // completed one. Reporting guide_finished there makes a guide whose anchors
    // never mount indistinguishable in telemetry from one a user completed.
    const events: string[] = []
    setGuideTelemetryHandler((e) => events.push(e.action))

    guideEngineState.start('connect')            // single-step sequence
    guideEngineState.next({ reason: 'anchor_timeout' })

    expect(events).toContain('guide_skipped')
    expect(events).not.toContain('guide_finished')
  })

  it('a user-driven advance off the last step DOES finish', () => {
    // The counterpart. Without it the first case passes for a store that emits
    // guide_skipped unconditionally — a different bug that looks identical.
    const events: string[] = []
    setGuideTelemetryHandler((e) => events.push(e.action))

    guideEngineState.start('connect')
    guideEngineState.next()                      // no reason -> ordinary completion

    expect(events).toContain('guide_finished')
    expect(events).not.toContain('guide_skipped')
  })
})
