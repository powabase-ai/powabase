import { describe, expect, it } from 'vitest'

import { CONSENT_REQUIRED_REGIONS, consentSignals } from './consent-mode'

describe('CONSENT_REQUIRED_REGIONS', () => {
  it('has 32 entries (27 EU + IS/LI/NO + GB + CH)', () => {
    expect(CONSENT_REQUIRED_REGIONS).toHaveLength(32)
  })

  it('includes the easy-to-forget outliers', () => {
    for (const code of ['DE', 'FR', 'GB', 'CH', 'IS', 'LI', 'NO']) {
      expect(CONSENT_REQUIRED_REGIONS).toContain(code)
    }
  })

  it('excludes non-consent-required regions', () => {
    for (const code of ['US', 'CA', 'BR', 'AU', 'IN']) {
      expect(CONSENT_REQUIRED_REGIONS).not.toContain(code)
    }
  })

  it('has no duplicates', () => {
    expect(new Set(CONSENT_REQUIRED_REGIONS).size).toBe(CONSENT_REQUIRED_REGIONS.length)
  })
})

describe('consentSignals', () => {
  it('granted sets all four Consent Mode v2 signals to granted', () => {
    expect(consentSignals(true)).toEqual({
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    })
  })

  it('denied sets all four signals to denied', () => {
    expect(consentSignals(false)).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    })
  })
})
