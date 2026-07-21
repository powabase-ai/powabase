const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
  : ''
const SUPABASE_URL = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : ''
const GOTRUE_URL = process.env.NEXT_PUBLIC_GOTRUE_URL
  ? new URL(process.env.NEXT_PUBLIC_GOTRUE_URL).origin
  : ''
const SUPABASE_PROJECTS_URL = 'https://*.supabase.co https://*.storage.supabase.co'
const SUPABASE_PROJECTS_URL_WS = 'wss://*.supabase.co'

// Powabase per-project subdomains. Each project is reachable at
// `<ref>.${PROJECT_DOMAIN_BASE}` (default `p.powabase.ai`; overridden for
// Judocu BYOC and other forks via the env var). The Realtime client opens
// a WebSocket directly to that host, so the CSP must allow both the HTTPS
// origin (REST + storage) and the WSS origin (Realtime); without these
// entries the WS connection is blocked even when the apikey is valid.
const PROJECT_DOMAIN_BASE = process.env.PROJECT_DOMAIN_BASE || 'p.powabase.ai'
const POWABASE_PROJECTS_URL = `https://*.${PROJECT_DOMAIN_BASE}`
const POWABASE_PROJECTS_URL_WS = `wss://*.${PROJECT_DOMAIN_BASE}`

// construct the URL for the Websocket Local URLs
let SUPABASE_LOCAL_PROJECTS_URL_WS = ''
if (SUPABASE_URL) {
  const url = new URL(SUPABASE_URL)
  const wsUrl = `${url.hostname}:${url.port}`
  SUPABASE_LOCAL_PROJECTS_URL_WS = `ws://${wsUrl} wss://${wsUrl}`
}

// Needed to test docs search in local dev
const SUPABASE_DOCS_PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : ''

// Needed to test docs content API in local dev
const SUPABASE_CONTENT_API_URL = process.env.NEXT_PUBLIC_CONTENT_API_URL
  ? new URL(process.env.NEXT_PUBLIC_CONTENT_API_URL).origin
  : ''

const isDevOrStaging =
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'local' ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'

const NIMBUS_STAGING_PROJECTS_URL = 'https://*.nmb-proj.com'
const NIMBUS_STAGING_PROJECTS_URL_WS = 'wss://*.nmb-proj.com'

const NIMBUS_PROD_PROJECTS_URL = process.env.NIMBUS_PROD_PROJECTS_URL || ''
const NIMBUS_PROD_PROJECTS_URL_WS = process.env.NIMBUS_PROD_PROJECTS_URL_WS || ''

const SUPABASE_STAGING_PROJECTS_URL = 'https://*.supabase.red https://*.storage.supabase.red'
const SUPABASE_STAGING_PROJECTS_URL_WS = 'wss://*.supabase.red'
const SUPABASE_COM_URL = 'https://supabase.com'
const CLOUDFLARE_CDN_URL = 'https://cdnjs.cloudflare.com'
const HCAPTCHA_SUBDOMAINS_URL = 'https://*.hcaptcha.com'
const HCAPTCHA_ASSET_URL = 'https://newassets.hcaptcha.com'
const HCAPTCHA_JS_URL = 'https://js.hcaptcha.com'
const CONFIGCAT_URL = 'https://cdn-global.configcat.com'
const CONFIGCAT_PROXY_URL = ['staging', 'local'].includes(process.env.NEXT_PUBLIC_ENVIRONMENT ?? '')
  ? 'https://configcat.supabase.green'
  : 'https://configcat.supabase.com'
const STRIPE_SUBDOMAINS_URL = 'https://*.stripe.com'
const STRIPE_JS_URL = 'https://js.stripe.com'
const STRIPE_NETWORK_URL = 'https://*.stripe.network'
const CLOUDFLARE_URL = 'https://www.cloudflare.com'
const VERCEL_URL = 'https://vercel.com'
const VERCEL_INSIGHTS_URL = 'https://*.vercel-insights.com'
const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_USER_CONTENT_URL = 'https://raw.githubusercontent.com'
const GITHUB_USER_AVATAR_URL = 'https://avatars.githubusercontent.com'
const GOOGLE_USER_AVATAR_URL = 'https://lh3.googleusercontent.com'

// This is a custom domain for Stape, which isused for GTM servers
const STAPE_URL = 'https://ss.supabase.com'

const VERCEL_LIVE_URL = 'https://vercel.live'
const SENTRY_URL =
  'https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io'
const SUPABASE_ASSETS_URL =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'
    ? 'https://frontend-assets.supabase.green'
    : 'https://frontend-assets.supabase.com'
const POSTHOG_URL = isDevOrStaging ? 'https://ph.supabase.green' : 'https://ph.supabase.com'

const USERCENTRICS_URLS = 'https://*.usercentrics.eu'
const USERCENTRICS_APP_URL = 'https://app.usercentrics.eu'

// used by vercel live preview
const PUSHER_URL = 'https://*.pusher.com'
const PUSHER_URL_WS = 'wss://*.pusher.com'

const GOOGLE_MAPS_API_URL = 'https://maps.googleapis.com'

const REDDIT_STATIC_URL = 'https://www.redditstatic.com'
const REDDIT_BEACON_URLS = 'https://alb.reddit.com https://www.reddit.com'

const GOOGLE_TAG_MANAGER_URL = 'https://www.googletagmanager.com'
// `analytics.google.com` (bare host) is the GA4 /g/collect endpoint under
// Consent Mode — the *.analytics.google.com wildcard does NOT match the bare
// host, so it must be listed explicitly.
const GOOGLE_ANALYTICS_URLS =
  'https://www.google-analytics.com https://analytics.google.com https://*.analytics.google.com'
const GOOGLE_DOUBLECLICK_URL = 'https://*.g.doubleclick.net'
// Google Ads + GA4 also POST conversion/collect hits to www.google.com
// (e.g. /g/collect, /pagead, /ccm). Country-coded variants (www.google.<tld>)
// used by some EEA conversion pings are not covered here — expand if needed.
const GOOGLE_CONVERSION_URL = 'https://www.google.com'

// Google Ads conversion + remarketing tags fired by the GTM container
// (GTM-MZ6MF9LF, see lib/google-tag-manager.tsx). Google's conversion verifier
// reported these origins as CSP-blocked; they were read off the container's own
// gtm.js tag set and are split into the directives below by how each tag uses
// them (script load / pixel / beacon-XHR / iframe). `www.googleadservices.com`
// is the conversion-critical one — the Google Ads conversion linker and
// conversion.js load from it; the rest back remarketing (googlesyndication,
// adservice.google.com, doubleclick) and YouTube video-audience tags.
const GOOGLE_ADSERVICES_URL = 'https://www.googleadservices.com'
const GOOGLE_SYNDICATION_URLS =
  'https://pagead2.googlesyndication.com https://ade.googlesyndication.com'
const GOOGLE_ADSERVICE_URL = 'https://adservice.google.com'
const GOOGLE_CCT_URL = 'https://cct.google'
const DOUBLECLICK_AD_URL = 'https://ad.doubleclick.net'
const YOUTUBE_URLS = 'https://www.youtube.com https://m.youtube.com'

// Microsoft Clarity (session analytics, app.powabase.ai only — see lib/clarity.tsx).
// The base tag loads from www.clarity.ms, then pulls collector scripts from and
// beacons telemetry to regional *.clarity.ms hosts, with a MUID cookie-sync to
// c.bing.com. Allowed for every build because the CSP only
// permits the origins; the client-side host gate decides whether to load at all.
const CLARITY_SCRIPT_URL = 'https://www.clarity.ms https://*.clarity.ms'
const CLARITY_BEACON_URL = 'https://*.clarity.ms https://c.bing.com'

module.exports.getCSP = function getCSP() {
  const DEFAULT_SRC_URLS = [
    API_URL,
    SUPABASE_URL,
    GOTRUE_URL,
    SUPABASE_LOCAL_PROJECTS_URL_WS,
    SUPABASE_PROJECTS_URL,
    SUPABASE_PROJECTS_URL_WS,
    POWABASE_PROJECTS_URL,
    POWABASE_PROJECTS_URL_WS,
    HCAPTCHA_SUBDOMAINS_URL,
    CONFIGCAT_URL,
    CONFIGCAT_PROXY_URL,
    STRIPE_SUBDOMAINS_URL,
    STRIPE_NETWORK_URL,
    CLOUDFLARE_URL,
    VERCEL_INSIGHTS_URL,
    GITHUB_API_URL,
    GITHUB_USER_CONTENT_URL,
    SUPABASE_ASSETS_URL,
    USERCENTRICS_URLS,
    STAPE_URL,
    GOOGLE_MAPS_API_URL,
    REDDIT_BEACON_URLS,
    GOOGLE_TAG_MANAGER_URL,
    GOOGLE_ANALYTICS_URLS,
    GOOGLE_DOUBLECLICK_URL,
    GOOGLE_CONVERSION_URL,
    // Google Ads conversion + remarketing beacons/XHR fired by the GTM container.
    GOOGLE_ADSERVICES_URL,
    GOOGLE_SYNDICATION_URLS,
    GOOGLE_ADSERVICE_URL,
    GOOGLE_CCT_URL,
    DOUBLECLICK_AD_URL,
    CLARITY_BEACON_URL,
    POSTHOG_URL,
    ...(!!NIMBUS_PROD_PROJECTS_URL ? [NIMBUS_PROD_PROJECTS_URL, NIMBUS_PROD_PROJECTS_URL_WS] : []),
    CLOUDFLARE_CDN_URL,
  ]
  const SCRIPT_SRC_URLS = [
    CLOUDFLARE_CDN_URL,
    HCAPTCHA_JS_URL,
    STRIPE_JS_URL,
    SUPABASE_ASSETS_URL,
    STAPE_URL,
    POSTHOG_URL,
    USERCENTRICS_URLS,
    REDDIT_STATIC_URL,
    GOOGLE_TAG_MANAGER_URL,
    // Google Ads conversion (googleadservices) + remarketing scripts loaded by
    // the GTM container's tags. GOOGLE_DOUBLECLICK_URL is here (not only in
    // default-/img-src) because the Ads view-through conversion loads an actual
    // <script> from googleads.g.doubleclick.net (/pagead/viewthroughconversion/…)
    // — script-src-elem falls back to script-src, not default-src, so it must be
    // listed explicitly here or the tag is blocked.
    GOOGLE_ADSERVICES_URL,
    GOOGLE_SYNDICATION_URLS,
    GOOGLE_ADSERVICE_URL,
    GOOGLE_DOUBLECLICK_URL,
    CLARITY_SCRIPT_URL,
  ]
  const FRAME_SRC_URLS = [
    HCAPTCHA_ASSET_URL,
    STRIPE_JS_URL,
    STAPE_URL,
    // GTM <noscript> fallback iframe (googletagmanager.com/ns.html) — see
    // lib/google-tag-manager.tsx / pages/_document.tsx. The script-src/img-src
    // entries already cover the JS path; this is only for no-JS visitors.
    GOOGLE_TAG_MANAGER_URL,
    // Google Ads conversion-linker iframe (doubleclick) + YouTube video
    // remarketing iframes fired by the GTM container's tags.
    DOUBLECLICK_AD_URL,
    YOUTUBE_URLS,
    ...(isDevOrStaging ? [POSTHOG_URL] : []),
  ]
  const IMG_SRC_URLS = [
    SUPABASE_URL,
    SUPABASE_COM_URL,
    SUPABASE_PROJECTS_URL,
    POWABASE_PROJECTS_URL,
    GITHUB_USER_AVATAR_URL,
    GOOGLE_USER_AVATAR_URL,
    SUPABASE_ASSETS_URL,
    USERCENTRICS_APP_URL,
    STAPE_URL,
    USERCENTRICS_URLS,
    REDDIT_BEACON_URLS,
    GOOGLE_ANALYTICS_URLS,
    // Consent Mode transmission pixels (googletagmanager.com/td, /a),
    // remarketing (doubleclick), and Ads conversion pixels (www.google.com).
    GOOGLE_TAG_MANAGER_URL,
    GOOGLE_DOUBLECLICK_URL,
    GOOGLE_CONVERSION_URL,
    // Google Ads conversion + remarketing pixels fired by the GTM container.
    GOOGLE_ADSERVICES_URL,
    GOOGLE_SYNDICATION_URLS,
    GOOGLE_CCT_URL,
    DOUBLECLICK_AD_URL,
    // Clarity's MUID cookie-sync to c.bing.com renders as a tracking pixel.
    CLARITY_BEACON_URL,
    ...(!!NIMBUS_PROD_PROJECTS_URL ? [NIMBUS_PROD_PROJECTS_URL, NIMBUS_PROD_PROJECTS_URL_WS] : []),
  ]
  const STYLE_SRC_URLS = [CLOUDFLARE_CDN_URL, SUPABASE_ASSETS_URL]
  const FONT_SRC_URLS = [CLOUDFLARE_CDN_URL, SUPABASE_ASSETS_URL]

  const defaultSrcDirective = [
    `default-src 'self'`,
    ...DEFAULT_SRC_URLS,
    ...(isDevOrStaging
      ? [
          SUPABASE_STAGING_PROJECTS_URL,
          SUPABASE_STAGING_PROJECTS_URL_WS,
          NIMBUS_STAGING_PROJECTS_URL,
          NIMBUS_STAGING_PROJECTS_URL_WS,
          VERCEL_LIVE_URL,
          SUPABASE_DOCS_PROJECT_URL,
          SUPABASE_CONTENT_API_URL,
        ]
      : []),
    PUSHER_URL_WS,
    SENTRY_URL,
  ].join(' ')

  const imgSrcDirective = [
    `img-src 'self'`,
    `blob:`,
    `data:`,
    ...IMG_SRC_URLS,
    ...(isDevOrStaging
      ? [SUPABASE_STAGING_PROJECTS_URL, NIMBUS_STAGING_PROJECTS_URL, VERCEL_URL]
      : []),
  ].join(' ')

  const scriptSrcDirective = [
    `script-src 'self'`,
    `'unsafe-eval'`,
    `'unsafe-inline'`,
    ...SCRIPT_SRC_URLS,
    VERCEL_LIVE_URL,
    PUSHER_URL,
    GOOGLE_MAPS_API_URL,
  ].join(' ')

  const frameSrcDirective = [`frame-src 'self'`, ...FRAME_SRC_URLS, VERCEL_LIVE_URL].join(' ')

  const styleSrcDirective = [
    `style-src 'self'`,
    `'unsafe-inline'`,
    ...STYLE_SRC_URLS,
    VERCEL_LIVE_URL,
  ].join(' ')

  const fontSrcDirective = [`font-src 'self'`, ...FONT_SRC_URLS, VERCEL_LIVE_URL].join(' ')

  const workerSrcDirective = [`worker-src 'self'`, `blob:`, `data:`].join(' ')

  const cspDirectives = [
    defaultSrcDirective,
    imgSrcDirective,
    scriptSrcDirective,
    frameSrcDirective,
    styleSrcDirective,
    fontSrcDirective,
    workerSrcDirective,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `block-all-mixed-content`,
    ...(process.env.NEXT_PUBLIC_IS_PLATFORM === 'true' &&
    process.env.NEXT_PUBLIC_ENVIRONMENT === 'prod'
      ? [`upgrade-insecure-requests`]
      : []),
  ]

  const csp = cspDirectives.join('; ') + ';'

  // Replace newline characters and spaces
  return csp.replace(/\s{2,}/g, ' ').trim()
}
