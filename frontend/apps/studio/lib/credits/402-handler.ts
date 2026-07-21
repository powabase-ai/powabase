/**
 * 402 toast handler with defensive parse.
 *
 * Per spec decision #24: in prod K8s, FE may roll ahead of
 * balance_cache.py. During that window, FE-new sees BE-old's
 * werkzeug text 402 body. Defensive try/catch falls back to
 * generic copy without the refill date — strictly better than
 * a JS parse error.
 */

import { daysFromNow, dayWord } from './format'

// Build the support link from env, with basic shape validation so a
// misconfigured env var (whitespace, missing "@", or empty) doesn't
// produce a dead "mailto:" button. Round-3 P5 caught that
// `Boolean("   ")` is true and `"not-an-email"` would build
// `mailto:not-an-email` — same dead-action-button UX shape we already
// guarded against for the unset case.
export function buildSupportLink(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // Minimum viable email: `x@y`. Not RFC 5322 — just enough to weed out
  // whitespace, single-token strings, and obvious garbage.
  if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) return null
  return `mailto:${trimmed}`
}

const SUPPORT_LINK = buildSupportLink(process.env.NEXT_PUBLIC_SUPPORT_EMAIL)

if (typeof window !== 'undefined' && SUPPORT_LINK === null) {
  // eslint-disable-next-line no-console
  console.warn(
    '[credits/402-handler] NEXT_PUBLIC_SUPPORT_EMAIL is not set or ' +
      'is not a valid email — the "Contact support" action button will ' +
      'be hidden on 402 toasts.',
  )
}

export type ShowToastFn = (args: {
  message: string
  type: 'error'
  action?: { label: string; href: string }
}) => void

export async function handle402Response(
  response: Response,
  showToast: ShowToastFn,
): Promise<void> {
  let body: { renews_at?: string } | null = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  // Only attach the action button when we have a real support link —
  // otherwise the button would render with href='#' and click into a
  // blank tab, which is worse UX than no button at all.
  const action = SUPPORT_LINK
    ? { label: 'Contact support →', href: SUPPORT_LINK }
    : undefined

  if (body && typeof body.renews_at === 'string') {
    const dateOnly = body.renews_at.split('T')[0]
    const days = daysFromNow(body.renews_at)
    // If the date is unparseable (NaN), drop the "(in N days)" clause
    // rather than rendering "in NaN days". The dateOnly part is the
    // raw string from the server; we surface it verbatim for the
    // operator-facing message.
    const message =
      days !== null
        ? `Out of credits. Free tier resets on ${dateOnly} (in ${days} ${dayWord(days)}). Need more now?`
        : `Out of credits. Free tier resets on ${dateOnly}. Need more now?`
    showToast({ message, type: 'error', action })
    return
  }

  showToast({
    message: 'Out of credits. Free tier resets at the start of each month. Need more now?',
    type: 'error',
    action,
  })
}
