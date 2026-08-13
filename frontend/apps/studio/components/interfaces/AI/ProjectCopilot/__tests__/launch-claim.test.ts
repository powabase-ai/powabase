import { describe, expect, it } from 'vitest'
import { looksLikeGuideLaunchClaim } from '../launch-claim'

describe('looksLikeGuideLaunchClaim', () => {
  it('matches common launch-claim phrasings', () => {
    expect(looksLikeGuideLaunchClaim("I've launched the walkthrough for you.")).toBe(true)
    expect(looksLikeGuideLaunchClaim('Starting the walkthrough now — follow along!')).toBe(true)
    expect(
      looksLikeGuideLaunchClaim("I'll highlight the New table button in the walkthrough.")
    ).toBe(true)
    expect(looksLikeGuideLaunchClaim('The walkthrough is now on screen.')).toBe(true)
    expect(looksLikeGuideLaunchClaim("I've launched it for you.")).toBe(true)
  })

  it('does not match ordinary replies that never mention a walkthrough', () => {
    expect(looksLikeGuideLaunchClaim('You can create a table from the editor.')).toBe(false)
    expect(looksLikeGuideLaunchClaim('Here is the SQL you asked for.')).toBe(false)
  })

  it('does not match a walkthrough mention with no launch verb', () => {
    expect(
      looksLikeGuideLaunchClaim('The walkthrough covers connecting your coding agent.')
    ).toBe(false)
  })

  it('does not match negated launch phrasing', () => {
    expect(looksLikeGuideLaunchClaim("I can't launch the walkthrough right now.")).toBe(false)
    expect(looksLikeGuideLaunchClaim('Sorry, I cannot start the walkthrough for that.')).toBe(
      false
    )
    expect(looksLikeGuideLaunchClaim("I won't open the walkthrough until you confirm.")).toBe(
      false
    )
    expect(
      looksLikeGuideLaunchClaim("I'm unable to launch the walkthrough for you right now.")
    ).toBe(false)
    expect(
      looksLikeGuideLaunchClaim("I'll show you — actually there's no walkthrough for this yet.")
    ).toBe(false)
  })

  it('handles null/undefined/empty text', () => {
    expect(looksLikeGuideLaunchClaim(null)).toBe(false)
    expect(looksLikeGuideLaunchClaim(undefined)).toBe(false)
    expect(looksLikeGuideLaunchClaim('')).toBe(false)
  })
})
