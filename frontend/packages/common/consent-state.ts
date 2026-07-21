import type Usercentrics from '@usercentrics/cmp-browser-sdk'
import type { BaseCategory, UserDecision } from '@usercentrics/cmp-browser-sdk'
import { proxy, snapshot, useSnapshot } from 'valtio'

import { IS_PLATFORM, LOCAL_STORAGE_KEYS } from './constants'

/**
 * Check if the user previously accepted all consent services by reading
 * localStorage state that was written before UC.init() overwrites it.
 *
 * Handles two scenarios (FE-2648):
 *
 * 1. Slow navigation: GTM's Usercentrics integration replaced uc_settings with
 *    compressed ucString/ucData after acceptAllServices(). On the next page load,
 *    UC.init() can't read that format and treats the user as new.
 *
 * 2. Fast navigation: User accepted on app A and navigated to app B before GTM
 *    finished writing ucData. App B's UC.init() overwrites uc_settings with a
 *    fresh controllerId and resets uc_user_interaction to false. We detect the
 *    prior uc_user_interaction: "true" before init stomps it.
 *
 * Must be called BEFORE UC.init() since init overwrites these keys.
 */
export function detectPriorConsent(): boolean {
  try {
    // Scenario 1: GTM wrote compressed format (slow navigation / same-app refresh)
    const ucData = localStorage?.getItem('ucData')
    if (ucData) {
      const data = JSON.parse(ucData)
      const services = data?.consent?.services
      if (services && typeof services === 'object') {
        const serviceValues = Object.values(services)
        if (
          serviceValues.length > 0 &&
          serviceValues.every(
            (s) =>
              typeof s === 'object' && s !== null && (s as { consent: boolean }).consent === true
          )
        ) {
          return true
        }
      }
    }

    // Scenario 2: SDK wrote uc_user_interaction: "true" (fast cross-app navigation)
    if (localStorage?.getItem('uc_user_interaction') === 'true') {
      return true
    }

    return false
  } catch {
    return false
  }
}

// Shared apex-scoped consent cookie. Contract: the marketing site
// (powabase-ai/website#24, merged) writes `pb_consent=granted|denied` with
// `Domain=.powabase.ai`, so it is readable AND writable on app.powabase.ai too.
// Exact value match required.
const PB_CONSENT_COOKIE = 'pb_consent'
const PB_CONSENT_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

/**
 * Read the cross-domain consent decision recorded in the `pb_consent` cookie
 * (see contract above). The marketing site is the primary consent surface; the
 * app honors this decision and never shows its own banner. Returns null when no
 * decision has been recorded (e.g. a user who reached the app without passing
 * through the site), in which case the caller falls back to the CMP.
 */
export function readSharedConsent(): boolean | null {
  if (typeof document === 'undefined') return null
  // End-anchored (lookahead for `;`, whitespace, or end) so a future drifted
  // value like `grantedX` doesn't match the prefix.
  const match = document.cookie.match(/(?:^|;\s*)pb_consent=(granted|denied)(?=;|\s|$)/)
  if (match) return match[1] === 'granted'
  // A present-but-unparseable cookie is contract drift — it falls through to the
  // CMP (null, same as absent), but unlike "absent" it deserves a signal.
  if (/(?:^|;\s*)pb_consent=/.test(document.cookie)) {
    console.warn('readSharedConsent: pb_consent cookie present but value unrecognized')
  }
  return null
}

/**
 * Record a consent decision in the shared apex cookie, so it propagates across
 * powabase.ai <-> app.powabase.ai and persists without the CMP. This is what
 * lets a cookie-bridged user change or withdraw consent from the in-app
 * Analytics toggle (mirrors the marketing site's writer). Host-only in local /
 * preview where there is no shared apex.
 */
export function writeSharedConsent(granted: boolean): void {
  if (typeof document === 'undefined') return
  const host = window.location.hostname
  const domain =
    host === 'powabase.ai' || host.endsWith('.powabase.ai') ? '; Domain=.powabase.ai' : ''
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${PB_CONSENT_COOKIE}=${granted ? 'granted' : 'denied'}; Path=/; ` +
    `Max-Age=${PB_CONSENT_MAX_AGE}; SameSite=Lax${domain}${secure}`
}

export const consentState = proxy({
  // Usercentrics state
  UC: null as Usercentrics | null,
  categories: null as BaseCategory[] | null,

  // Where the current decision came from: 'bridge' = the shared cross-domain
  // cookie (no in-app CMP — managed via the Analytics toggle, which writes the
  // cookie); 'cmp' = Usercentrics initialized; null = neither yet (or the CMP
  // failed to load — the genuine ad-blocker/network case the settings UI warns
  // about).
  source: null as 'bridge' | 'cmp' | null,

  // Our state
  showConsentToast: false,
  hasConsented: false,
  acceptAll: () => {
    const previousConsentValue = consentState.hasConsented
    consentState.hasConsented = true
    consentState.showConsentToast = false

    // Bridge mode (no CMP): record the decision in the shared cookie so it
    // propagates cross-domain and persists. This is the working in-app accept
    // path for cookie-bridged users.
    if (!consentState.UC) {
      writeSharedConsent(true)
      return
    }

    consentState.UC.acceptAllServices()
      .then(() => {
        consentState.categories = consentState.UC?.getCategoriesBaseInfo() ?? null
      })
      .catch(() => {
        consentState.hasConsented = previousConsentValue
        consentState.showConsentToast = true
      })
  },
  denyAll: () => {
    const previousConsentValue = consentState.hasConsented
    consentState.hasConsented = false
    consentState.showConsentToast = false

    // Bridge mode (no CMP): record the withdrawal in the shared cookie.
    if (!consentState.UC) {
      writeSharedConsent(false)
      return
    }

    consentState.UC.denyAllServices()
      .then(() => {
        consentState.categories = consentState.UC?.getCategoriesBaseInfo() ?? null
      })
      .catch(() => {
        consentState.hasConsented = previousConsentValue
        consentState.showConsentToast = true
      })
  },
  updateServices: (decisions: UserDecision[]) => {
    if (!consentState.UC) return

    consentState.showConsentToast = false

    consentState.UC.updateServices(decisions)
      .then(() => {
        consentState.hasConsented = consentState.UC?.areAllConsentsAccepted() ?? false
        consentState.categories = consentState.UC?.getCategoriesBaseInfo() ?? null
      })
      .catch(() => {
        consentState.showConsentToast = true
      })
  },
})

async function initUserCentrics() {
  if (process.env.NODE_ENV === 'test' || !IS_PLATFORM) return

  // [Alaister] For local development and staging, we accept all consent by default.
  // If you need to test usercentrics in these environments, comment out this
  // NEXT_PUBLIC_ENVIRONMENT check and add an ngrok domain to usercentrics
  if (
    process.env.NEXT_PUBLIC_ENVIRONMENT === 'local' ||
    process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'
  ) {
    consentState.hasConsented = true
    consentState.source = 'bridge'
    return
  }

  // Cross-domain consent bridge: the marketing site (powabase.ai) is the single
  // consent surface and records the decision in a `pb_consent` cookie scoped to
  // `.powabase.ai`, readable here on app.powabase.ai. Honor it and never show an
  // in-app banner. Falls through to the CMP below only for users who reached the
  // app without passing through the site (no cookie).
  const sharedConsent = readSharedConsent()
  if (sharedConsent !== null) {
    consentState.hasConsented = sharedConsent
    consentState.showConsentToast = false
    consentState.source = 'bridge'
    return
  }

  // Check for prior consent BEFORE UC.init(), which can't read the compressed
  // ucData format written by the GTM/Usercentrics integration (FE-2648).
  const previouslyAccepted = detectPriorConsent()

  try {
    const { default: Usercentrics } = await import('@usercentrics/cmp-browser-sdk')

    const UC = new Usercentrics(process.env.NEXT_PUBLIC_USERCENTRICS_RULESET_ID!, {
      rulesetId: process.env.NEXT_PUBLIC_USERCENTRICS_RULESET_ID,
      useRulesetId: true,
    })

    const initialUIValues = await UC.init()

    consentState.UC = UC
    consentState.source = 'cmp'
    const hasConsented = UC.areAllConsentsAccepted()

    // If the SDK wants to show the banner but the user previously accepted
    // (detected via ucData or uc_user_interaction before init overwrote them),
    // silently re-accept instead of showing the banner again (FE-2648).
    if (initialUIValues.initialLayer === 0 && !hasConsented && previouslyAccepted) {
      consentState.hasConsented = true
      consentState.showConsentToast = false
      consentState.categories = UC.getCategoriesBaseInfo()
      localStorage?.removeItem(LOCAL_STORAGE_KEYS.TELEMETRY_CONSENT)
      UC.acceptAllServices()
        .then(() => {
          consentState.categories = UC.getCategoriesBaseInfo()
        })
        .catch(() => {
          // If re-accept fails, fall back to showing the banner
          consentState.hasConsented = false
          consentState.showConsentToast = true
        })
      return
    }

    // 0 = first layer, aka show consent toast
    consentState.showConsentToast = initialUIValues.initialLayer === 0
    consentState.hasConsented = hasConsented
    consentState.categories = UC.getCategoriesBaseInfo()

    // If the user has previously consented (before usercentrics), accept all services
    if (!hasConsented && localStorage?.getItem(LOCAL_STORAGE_KEYS.TELEMETRY_CONSENT) === 'true') {
      consentState.acceptAll()
      localStorage.removeItem(LOCAL_STORAGE_KEYS.TELEMETRY_CONSENT)
    }
  } catch (error) {
    console.error('Failed to initialize Usercentrics:', error)
    // If SDK fails but user previously accepted, honor that
    if (previouslyAccepted) {
      consentState.hasConsented = true
    }
  }
}

// Usercentrics is not available on the server
if (typeof window !== 'undefined') {
  initUserCentrics()
}

// Public API for consent

export function hasConsented() {
  return snapshot(consentState).hasConsented
}

export function useConsentState() {
  const snap = useSnapshot(consentState)

  return {
    hasAccepted: snap.hasConsented,
    categories: snap.categories as BaseCategory[] | null,
    source: snap.source,
    acceptAll: snap.acceptAll,
    denyAll: snap.denyAll,
    updateServices: snap.updateServices,
  }
}
