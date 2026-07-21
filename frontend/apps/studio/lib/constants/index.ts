// Ignore barrel file rule here since it's just exporting more constants
// eslint-disable-next-line barrel-files/avoid-re-export-all
export * from './infrastructure'

export const IS_PLATFORM = process.env.NEXT_PUBLIC_IS_PLATFORM === 'true'

/**
 * Indicates that the app is running in a test environment (E2E tests).
 * Set via NEXT_PUBLIC_NODE_ENV=test in the generateLocalEnv.js script.
 */
export const IS_TEST_ENV = process.env.NEXT_PUBLIC_NODE_ENV === 'test'

export const API_URL = (() => {
  if (process.env.NODE_ENV === 'test') return 'http://localhost:3000/api'
  //  If running in platform, use API_URL from the env var
  if (IS_PLATFORM) return process.env.NEXT_PUBLIC_API_URL!
  // If running in browser, let it add the host
  if (typeof window !== 'undefined') return '/api'
  // If running self-hosted Vercel preview, use VERCEL_URL
  if (!!process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api`
  // If running on self-hosted, use NEXT_PUBLIC_SITE_URL
  if (!!process.env.NEXT_PUBLIC_SITE_URL) return `${process.env.NEXT_PUBLIC_SITE_URL}/api`
  return '/api'
})()

export const PG_META_URL = IS_PLATFORM
  ? process.env.PLATFORM_PG_META_URL
  : process.env.STUDIO_PG_META_URL
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/**
 * @deprecated use DATETIME_FORMAT
 */
export const DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ'

// should be used for all dayjs formattings shown to the user. Includes timezone info.
export const DATETIME_FORMAT = 'DD MMM YYYY, HH:mm:ss (ZZ)'

export const GOTRUE_ERRORS = {
  UNVERIFIED_GITHUB_USER: 'Error sending confirmation mail',
}

export const STRIPE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || 'pk_test_XVwg5IZH3I9Gti98hZw6KRzd00v5858heG'

// Validated against ^[A-Za-z0-9_-]+$ because these are interpolated into
// inline <Script> tags via dangerouslySetInnerHTML; an unsanitized value
// would be an XSS sink. Also catches typos like trailing whitespace.
const PIXEL_ID_PATTERN = /^[A-Za-z0-9_-]+$/

const rawRedditPixelId = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID || ''
export const REDDIT_PIXEL_ID = PIXEL_ID_PATTERN.test(rawRedditPixelId)
  ? rawRedditPixelId
  : ''

const rawGaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || ''
export const GA_MEASUREMENT_ID = PIXEL_ID_PATTERN.test(rawGaMeasurementId)
  ? rawGaMeasurementId
  : ''

// Google Tag Manager container id (e.g. "GTM-XXXXXXX"). Validated with the
// same pattern as the pixel ids above because it IS interpolated into the
// inline GTM bootstrap <script> via dangerouslySetInnerHTML (see
// pages/_document.tsx) — an unsanitized value would be an XSS sink.
const rawGtmId = process.env.NEXT_PUBLIC_GTM_ID || ''
export const GTM_ID = PIXEL_ID_PATTERN.test(rawGtmId) ? rawGtmId : ''
// Single gate shared by GTM's two halves — the bootstrap script in <head> and
// the <noscript> iframe in <body>, both in pages/_document.tsx — so they can't
// diverge and ship a half-configured tag.
export const GTM_ENABLED = IS_PLATFORM && Boolean(GTM_ID)

// Microsoft Clarity project id (see lib/clarity.tsx). Validated with the same
// pattern as the pixel ids for consistency. It is not an innerHTML sink here —
// lib/clarity.tsx assigns it to script.src — but validating still rejects a
// malformed id that would silently break the tag URL.
const rawClarityId = process.env.NEXT_PUBLIC_CLARITY_ID || ''
export const CLARITY_PROJECT_ID = PIXEL_ID_PATTERN.test(rawClarityId) ? rawClarityId : ''

// Google Ads account id (e.g. "AW-18228868400"). Loaded via the same gtag.js
// instance as GA4 (see google-analytics-tag.tsx). Validated like the pixel ids
// above because the id IS interpolated into the inline init <Script> (XSS sink).
const rawGoogleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || ''
export const GOOGLE_ADS_ID = PIXEL_ID_PATTERN.test(rawGoogleAdsId) ? rawGoogleAdsId : ''

// Per-conversion-action labels. The Google Ads "send_to" target is
// `${GOOGLE_ADS_ID}/${label}`. Unlike the id, labels are passed as runtime
// gtag() arguments — never into innerHTML — so they are NOT an XSS sink and
// are used verbatim (trim only). We deliberately do not pattern-validate: a
// label that doesn't match base64url would otherwise be silently dropped to ''
// and the conversion would go missing with no signal. An empty value (var
// unset) still no-ops the event at the call sites.
export const GOOGLE_ADS_SIGNUP_LABEL = (process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL || '').trim()
export const GOOGLE_ADS_PAID_LABEL = (process.env.NEXT_PUBLIC_GOOGLE_ADS_PAID_LABEL || '').trim()

export const POSTHOG_URL =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging' ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'local'
    ? 'https://ph.supabase.green'
    : 'https://ph.supabase.com'

export const USAGE_APPROACHING_THRESHOLD = 0.75

export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.powabase.ai'

export const OPT_IN_TAGS = {
  AI_SQL: 'AI_SQL_GENERATOR_OPT_IN',
  AI_DATA: 'AI_DATA_GENERATOR_OPT_IN',
  AI_LOG: 'AI_LOG_GENERATOR_OPT_IN',
}

export const GB = 1024 * 1024 * 1024
export const MB = 1024 * 1024
export const KB = 1024

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const TS_LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "english", label: "English" },
  { value: "simple", label: "Simple (language-agnostic)" },
  { value: "arabic", label: "Arabic" },
  { value: "armenian", label: "Armenian" },
  { value: "basque", label: "Basque" },
  { value: "catalan", label: "Catalan" },
  { value: "danish", label: "Danish" },
  { value: "dutch", label: "Dutch" },
  { value: "finnish", label: "Finnish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "greek", label: "Greek" },
  { value: "hindi", label: "Hindi" },
  { value: "hungarian", label: "Hungarian" },
  { value: "indonesian", label: "Indonesian" },
  { value: "irish", label: "Irish" },
  { value: "italian", label: "Italian" },
  { value: "lithuanian", label: "Lithuanian" },
  { value: "nepali", label: "Nepali" },
  { value: "norwegian", label: "Norwegian" },
  { value: "portuguese", label: "Portuguese" },
  { value: "romanian", label: "Romanian" },
  { value: "russian", label: "Russian" },
  { value: "serbian", label: "Serbian" },
  { value: "spanish", label: "Spanish" },
  { value: "swedish", label: "Swedish" },
  { value: "tamil", label: "Tamil" },
  { value: "turkish", label: "Turkish" },
  { value: "yiddish", label: "Yiddish" },
]
