import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

import { daysFromNow, dayWord } from '@/lib/credits/format'

describe('daysFromNow', () => {
  // Pin "now" to a known instant so all the relative calculations below
  // are deterministic. Without freezing the clock, the "in N days" arithmetic
  // shifts every time the suite runs.
  const FROZEN_NOW = new Date('2026-05-20T12:00:00Z')

  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('returns null for unparseable string (round-2 P1 / R3-U3 regression guard)', () => {
    // The whole reason format.ts was extracted in round-2 — CreditBar's
    // local daysFromNow returned NaN here and rendered "in NaN days".
    expect(daysFromNow('garbage')).toBeNull()
  })

  it('returns null for empty string (R3-M1 edge case)', () => {
    // Slipped past round-2's `typeof === 'string'` guard in CreditBar.
    expect(daysFromNow('')).toBeNull()
  })

  it('rounds whole days up to next day', () => {
    // 36 hours ahead → 2 days (Math.ceil, not Math.round)
    expect(daysFromNow('2026-05-22T00:00:00Z')).toBe(2)
  })

  it('clamps past dates to 0 rather than returning negative days', () => {
    expect(daysFromNow('2026-05-01T00:00:00Z')).toBe(0)
  })

  it('returns 0 for the current instant (not 1)', () => {
    expect(daysFromNow('2026-05-20T12:00:00Z')).toBe(0)
  })
})

describe('dayWord', () => {
  it('singular for 1', () => {
    expect(dayWord(1)).toBe('day')
  })

  it('plural for 0', () => {
    // English: "in 0 days", not "in 0 day"
    expect(dayWord(0)).toBe('days')
  })

  it('plural for >1', () => {
    expect(dayWord(7)).toBe('days')
  })
})
