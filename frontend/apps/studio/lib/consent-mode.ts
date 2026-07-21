// Pure helpers for Google Consent Mode v2, kept out of the React component
// (google-analytics-tag.tsx) so the compliance-critical region list and signal
// shape can be unit-tested — a silently-deleted EEA code would otherwise demote
// those users from denied→granted with nothing to catch it.

// Regions where ad/analytics storage requires opt-in: the 27 EU members + the
// EEA-EFTA states (IS/LI/NO) + the UK + Switzerland. Consent Mode defaults to
// denied here (cookieless, modeled conversions until the user accepts on the
// marketing site) and granted everywhere else, so non-EEA + direct-to-app
// visitors are measured without an in-app banner. ISO-3166-1 alpha-2, as gtag
// expects for `region`.
export const CONSENT_REQUIRED_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
] as const

export type ConsentSignalState = 'granted' | 'denied'

// The four Consent Mode v2 signals, all set to the same state. PII-free — this
// is the whole payload sent for a decision, so firing it without consent is
// genuinely cookieless under Consent Mode.
export function consentSignals(granted: boolean): Record<string, ConsentSignalState> {
  const v: ConsentSignalState = granted ? 'granted' : 'denied'
  return { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v }
}
