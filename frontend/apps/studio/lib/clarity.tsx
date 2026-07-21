import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

import { CLARITY_PROJECT_ID } from './constants'

// Microsoft Clarity session analytics. The project id is configurable via
// NEXT_PUBLIC_CLARITY_ID (see lib/constants; the Dockerfile defaults it to our
// project) and, like the website integration, it is NOT consent-gated. It only
// loads on the real app.powabase.ai host: Studio's Dockerfile bakes
// NEXT_PUBLIC_IS_PLATFORM=true into every build and the frontend image is
// replicated to BYOC tenants (e.g. Judocu), so a runtime hostname check — not
// IS_PLATFORM — is what keeps other tenants' session recordings out of our
// Clarity project.
//
// Update CLARITY_HOST if the app domain ever changes — a stale value silently
// disables Clarity with no signal.
const CLARITY_HOST = 'app.powabase.ai'

// Module-level so a tag load failure is reported at most once per page load;
// ad-blockers trigger onerror for many users and would otherwise burn quota.
let clarityLoadErrorReported = false

export const Clarity = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!CLARITY_PROJECT_ID) return
    if (window.location.hostname !== CLARITY_HOST) return
    if (window.clarity) return

    // Clarity's base snippet: queue calls on window.clarity until the async tag
    // script loads and takes over. We push a rest-param array rather than the
    // canonical `arguments` object; both are array-like, so the tag drains either.
    window.clarity = function clarity(...args: unknown[]) {
      const queue = (window.clarity!.q = window.clarity!.q || [])
      queue.push(args)
    }

    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`
    // Mirror google-analytics-tag.tsx: a load failure (bad id override, outage,
    // or a dropped *.clarity.ms CSP origin) otherwise leaves the dashboard
    // silently empty. Report it once so the breakage is discoverable.
    script.onerror = () => {
      if (clarityLoadErrorReported) return
      clarityLoadErrorReported = true
      Sentry.captureMessage('Clarity: tag failed to load', { level: 'warning' })
    }
    const firstScript = document.getElementsByTagName('script')[0]
    firstScript.parentNode!.insertBefore(script, firstScript)
  }, [])

  return null
}
