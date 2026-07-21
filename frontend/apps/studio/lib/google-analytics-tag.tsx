import * as Sentry from '@sentry/nextjs'
import { readSharedConsent, useConsentState, useIsLoggedIn } from 'common'
import { useRouter } from 'next/router'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

import { useProfileQuery } from '@/data/profile/profile-query'
import { CONSENT_REQUIRED_REGIONS, consentSignals } from './consent-mode'
import { GA_MEASUREMENT_ID, GOOGLE_ADS_ID, IS_PLATFORM } from './constants'

// Module-level so we report at most once per page load. Ad-blockers will
// trigger onError for every user that has them; without this guard Sentry
// quota would be eaten by an expected condition.
let gaLoadErrorReported = false

export const GoogleAnalyticsTag = () => {
  const { hasAccepted } = useConsentState()
  const isLoggedIn = useIsLoggedIn()
  // Consent Mode v2: the tag LOADS regardless of consent. Consent state (set
  // below) governs whether hits are cookie-based or cookieless/modeled. So the
  // gates here are "configured", not "consented". gaConfigured drives the
  // GA4-specific behaviour (user_id binding, page_view); adsConfigured only
  // needs the one-time `config`. The shared gtag.js loader renders when EITHER
  // is configured so we never load googletagmanager.com twice.
  const gaConfigured = IS_PLATFORM && !!GA_MEASUREMENT_ID
  const adsConfigured = IS_PLATFORM && !!GOOGLE_ADS_ID
  const enabled = gaConfigured || adsConfigured
  // Only fetch the profile (for user_id binding) under granted consent — we
  // don't attach a persistent identity to cookieless/denied pings.
  const { data: profile, isPending: profilePending } = useProfileQuery({
    enabled: gaConfigured && hasAccepted && isLoggedIn,
  })
  const userId = profile?.gotrue_id ?? null

  // Wait until we know the user (or know they're logged out) before binding
  // user_id, so events carry the right identity for returning signed-in users.
  // If logged out, the profile query is disabled and profilePending stays true;
  // treat as "user resolved" immediately.
  const userResolved = !isLoggedIn || !profilePending

  // gtagReady is flipped true by the inline init Script's onReady (fires after
  // the script has executed and `window.gtag` exists). This is what couples
  // the React effect to script load order — without it, the effect could run
  // before gtag is defined and never re-fire.
  const [gtagReady, setGtagReady] = useState(false)
  const router = useRouter()
  // Capture the landing URL once; if the user navigates before gtag is ready
  // we still attribute the first page_view to the page they actually landed
  // on. Subsequent navigations are handled by the routeChangeComplete effect.
  const landingPathRef = useRef(router.asPath)
  const initialPageViewSentRef = useRef(false)

  // Apply the explicit consent decision the marketing site recorded in the
  // shared `pb_consent` cookie. No cookie (e.g. a visitor who came straight to
  // the app) => leave the regional default in place (granted outside the EEA,
  // denied within), so they're still measured.
  useEffect(() => {
    if (!enabled || !gtagReady) return
    if (typeof window.gtag !== 'function') return
    const decision = readSharedConsent()
    if (decision !== null) {
      window.gtag('consent', 'update', consentSignals(decision))
    }
  }, [enabled, gtagReady, hasAccepted])

  // Initial page_view — fire once gtag is ready, regardless of consent (Consent
  // Mode governs cookie vs modeled). routeChangeComplete doesn't fire on the
  // first paint, so it's sent manually here. send_page_view:false on every
  // config keeps this + the SPA handler the single source of page_view.
  useEffect(() => {
    if (!gaConfigured || !gtagReady) return
    if (typeof window.gtag !== 'function') return
    if (initialPageViewSentRef.current) return
    initialPageViewSentRef.current = true
    window.gtag('event', 'page_view', { page_path: landingPathRef.current })
  }, [gaConfigured, gtagReady])

  // Bind user_id under granted consent (after the profile resolves); when
  // consent isn't granted — revoked via the in-app Analytics toggle, or logged
  // out — push null so a previously-bound identity is cleared and never rides
  // on cookieless/denied pings. Only the granted branch waits on userResolved
  // (we need the id); the null branch fires immediately on revoke.
  useEffect(() => {
    if (!gaConfigured || !gtagReady) return
    if (typeof window.gtag !== 'function') return
    if (hasAccepted && !userResolved) return
    window.gtag('config', GA_MEASUREMENT_ID, {
      user_id: hasAccepted ? userId : null,
      send_page_view: false,
    })
  }, [gaConfigured, gtagReady, hasAccepted, userResolved, userId])

  // SPA-nav page_view. Lives here (not in _app.tsx) so it unmounts with the
  // component — otherwise window.gtag persists in memory and every nav would
  // keep firing page_view until tab refresh.
  useEffect(() => {
    if (!gaConfigured) return
    const handleRouteChange = (url: string) => {
      window.gtag?.('event', 'page_view', { page_path: url })
    }
    router.events.on('routeChangeComplete', handleRouteChange)
    return () => router.events.off('routeChangeComplete', handleRouteChange)
  }, [gaConfigured, router.events])

  if (!enabled) return null

  // gtag.js only needs to be fetched once for any number of products; load it
  // under whichever id is configured (GA preferred, else Ads).
  const loaderId = GA_MEASUREMENT_ID || GOOGLE_ADS_ID

  // Inline init: define gtag, set Consent Mode v2 defaults BEFORE any config
  // (region-specific denied for the EEA, granted elsewhere; wait_for_update
  // gives the cookie `update` above a moment to land), then `config` each
  // product. GA4 suppresses send_page_view (the effects above own page_view).
  const initScript =
    `window.dataLayer=window.dataLayer||[];` +
    `function gtag(){dataLayer.push(arguments);}` +
    `gtag('consent','default',{'ad_storage':'denied','ad_user_data':'denied',` +
    `'ad_personalization':'denied','analytics_storage':'denied',` +
    `'region':${JSON.stringify(CONSENT_REQUIRED_REGIONS)},'wait_for_update':500});` +
    `gtag('consent','default',{'ad_storage':'granted','ad_user_data':'granted',` +
    `'ad_personalization':'granted','analytics_storage':'granted'});` +
    `gtag('js',new Date());` +
    (gaConfigured ? `gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false});` : '') +
    (adsConfigured ? `gtag('config','${GOOGLE_ADS_ID}');` : '')

  return (
    <>
      <Script
        id="ga-loader"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${loaderId}`}
        onError={(error) => {
          // Fires on network failure or non-2xx from googletagmanager.com.
          // CSP blocks and ad-blockers are not always reported here (browser
          // dependent), but this still catches the common breakage modes
          // (DNS, region blocks, expired/typo'd measurement ID).
          if (gaLoadErrorReported) return
          gaLoadErrorReported = true
          Sentry.captureMessage('GA: gtag.js failed to load', {
            level: 'warning',
            extra: { error: String(error) },
          })
        }}
      />
      <Script
        id="ga-init"
        strategy="afterInteractive"
        onReady={() => setGtagReady(true)}
        dangerouslySetInnerHTML={{ __html: initScript }}
      />
    </>
  )
}
