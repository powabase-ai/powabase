import { describe, expect, it } from 'vitest'
import { docsNoticeCopy, isDocsNotice } from '../docs-notice-copy'

/**
 * The backend distinguishes WHY an answer wasn't docs-grounded
 * (docs_not_configured / docs_unreachable / docs_not_ready) — the panel copy
 * must tell the operator whether to CONFIGURE something, FIX something, or
 * just WAIT, instead of the old catch-all "couldn't be reached" (which is
 * simply wrong on an unconfigured self-host stack).
 */
describe('isDocsNotice', () => {
  it('accepts the three backend kinds plus the legacy catch-all', () => {
    expect(isDocsNotice('docs_not_configured')).toBe(true)
    expect(isDocsNotice('docs_unreachable')).toBe(true)
    expect(isDocsNotice('docs_not_ready')).toBe(true)
    expect(isDocsNotice('docs_unavailable')).toBe(true)
  })

  it('accepts unknown future docs_* kinds so the warning cannot silently turn off', () => {
    expect(isDocsNotice('docs_index_rebuilding')).toBe(true)
  })

  it('rejects non-docs kinds', () => {
    expect(isDocsNotice('out_of_credits')).toBe(false)
    expect(isDocsNotice('')).toBe(false)
    expect(isDocsNotice(undefined)).toBe(false)
  })
})

describe('docsNoticeCopy', () => {
  it('tells the operator to configure docs search when it is not configured', () => {
    const copy = docsNoticeCopy('docs_not_configured')
    expect(copy).toMatch(/isn.t configured/i)
    expect(copy).not.toMatch(/reached/i)
  })

  it('reports an unreachable index as an outage, not a config problem', () => {
    const copy = docsNoticeCopy('docs_unreachable')
    expect(copy).toMatch(/couldn.t be reached/i)
    expect(copy).not.toMatch(/configured/i)
  })

  it('reports a not-ready index as still building', () => {
    const copy = docsNoticeCopy('docs_not_ready')
    expect(copy).toMatch(/still being built/i)
  })

  it('keeps the legacy catch-all kind rendering as an outage', () => {
    // Older backends emit docs_unavailable for every degraded cause; render it
    // like unreachable rather than dropping the notice.
    expect(docsNoticeCopy('docs_unavailable')).toBe(docsNoticeCopy('docs_unreachable'))
  })

  it('falls back to generic ungrounded-answer copy for unknown docs_* kinds', () => {
    const copy = docsNoticeCopy('docs_index_rebuilding')
    expect(copy).toMatch(/answered without documentation/i)
    expect(copy).toMatch(/official docs/i)
  })

  it('always warns that the answer was ungrounded', () => {
    for (const kind of [
      'docs_not_configured',
      'docs_unreachable',
      'docs_not_ready',
      'docs_unavailable',
    ] as const) {
      expect(docsNoticeCopy(kind)).toMatch(/answered without documentation/i)
    }
  })
})
