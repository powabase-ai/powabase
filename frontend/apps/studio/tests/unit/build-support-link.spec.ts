import { describe, it, expect } from 'vitest'

import { buildSupportLink } from '@/lib/credits/402-handler'

describe('buildSupportLink', () => {
  // Round-4 M1 — the round-3 P5 validation logic shipped without a
  // direct unit test (format.spec.ts covered the older format.ts
  // utilities, not the new buildSupportLink). These cases pin the
  // shape contract so a regex relaxation or accidental coercion
  // change fails loudly.

  it('returns null for undefined (env not set)', () => {
    expect(buildSupportLink(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(buildSupportLink('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    // Round-3 P5 explicit case — Boolean("   ") is true and slipped
    // past the previous truthy check.
    expect(buildSupportLink('   ')).toBeNull()
    expect(buildSupportLink('\t\n')).toBeNull()
  })

  it('returns null for single token without @ (not an email)', () => {
    expect(buildSupportLink('not-an-email')).toBeNull()
    expect(buildSupportLink('support')).toBeNull()
  })

  it('returns null for trailing @ (empty domain)', () => {
    expect(buildSupportLink('support@')).toBeNull()
  })

  it('returns null for leading @ (empty local part)', () => {
    expect(buildSupportLink('@powabase.ai')).toBeNull()
  })

  it('returns null for multiple @ (invalid shape)', () => {
    expect(buildSupportLink('a@b@c')).toBeNull()
  })

  it('returns mailto: for a valid email', () => {
    expect(buildSupportLink('support@powabase.ai')).toBe('mailto:support@powabase.ai')
  })

  it('trims surrounding whitespace from a valid email', () => {
    expect(buildSupportLink('  support@powabase.ai  ')).toBe('mailto:support@powabase.ai')
  })

  it('accepts a@b — minimum viable shape per the documented contract', () => {
    // The regex is intentionally permissive on the TLD side; this test
    // pins that decision so a stricter regex would fail this case loudly
    // (forcing the author to update the docstring at the same time).
    expect(buildSupportLink('a@b')).toBe('mailto:a@b')
  })
})
