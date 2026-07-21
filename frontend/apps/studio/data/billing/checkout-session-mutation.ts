import { useMutation } from '@tanstack/react-query'

import { constructHeaders } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'

export type CheckoutSessionVariables = {
  slug: string
  planId: 'self-serve' | 'scale'
  returnUrl?: string
}

// Two MUTUALLY EXCLUSIVE response shapes from POST /billing/checkout-session:
//  - Free->Paid: Stripe Checkout session => { url } (open in a new tab).
//  - Paid->Paid (e.g. self-serve -> Scale): in-place subscription.modify =>
//    { status: 'upgraded', subscription_id } and NO url (see routes/billing.py
//    create_checkout_session, ~L521). The old code did `window.location.href =
//    data.url` unconditionally, so the paid->paid branch navigated to
//    `/undefined` -> 404 even though the upgrade had already succeeded.
//
// Modelled as a discriminated union (the `?: never` arms make it "url XOR
// upgraded") so the type, not just a runtime comment, guarantees a caller
// can't read both — `if (data.url)` narrows to the Checkout shape, else to the
// in-place-upgrade shape. An all-optional `{ url?; status?; subscription_id? }`
// silently allowed `{}` and `{ url, subscription_id }`, neither of which the CP
// ever returns.
export type CheckoutSessionResponse =
  | { url: string; status?: never; subscription_id?: never }
  | { url?: never; status: 'upgraded'; subscription_id: string }

/**
 * Error thrown on a non-2xx response. Carries the CP's `error_hint` so the
 * caller's onError can map it to a user-facing toast. PR #499 R1 #5b: the
 * CP returns structured JSON with `error`, `error_hint`, and `message`
 * fields (e.g. `already_on_plan`, `use_portal_for_downgrade`, `not_synced`,
 * `card_declined`). Before this change these were swallowed because the
 * mutation only `throw new Error(textBody)` without parsing.
 */
export class CheckoutSessionError extends Error {
  errorHint?: string
  status: number
  serverMessage?: string

  constructor(args: {
    status: number
    errorHint?: string
    serverMessage?: string
    message: string
  }) {
    super(args.message)
    this.name = 'CheckoutSessionError'
    this.status = args.status
    this.errorHint = args.errorHint
    this.serverMessage = args.serverMessage
  }
}

export async function createCheckoutSession(
  args: CheckoutSessionVariables
): Promise<CheckoutSessionResponse> {
  const returnUrl =
    // CP-2 single owner: send bare path; CP appends ?checkout=success.
    // PR #499 R3: route is /org/<slug>/billing (top-level org page).
    args.returnUrl ?? `/org/${args.slug}/billing`
  // PR #499 R1 #5a: previous version used raw fetch() with only
  // 'Content-Type' — no Authorization header. The CP's @require_auth
  // decorator reads `Authorization: Bearer <jwt>` from getAccessToken();
  // without it, every checkout-session POST returned 401. Use the shared
  // constructHeaders helper (same one as the openapi-fetch client middleware
  // on line 90 of fetchers.ts) so the access token is attached automatically.
  const headers = await constructHeaders({ 'Content-Type': 'application/json' })
  // Route via API_URL (= NEXT_PUBLIC_API_URL, e.g. http://localhost:5000/api
  // for docker-compose dev, https://app.powabase.ai/api in prod). Raw
  // relative `fetch('/api/platform/...')` resolves to the FE origin (port
  // 3001 locally) which has no such route → 404. Sibling typed queries go
  // through openapi-fetch's client (which respects API_URL); this route
  // isn't in the generated OpenAPI types yet, so we hand-roll the URL.
  const res = await fetch(
    `${API_URL}/platform/organizations/${args.slug}/billing/checkout-session`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ plan_id: args.planId, return_url: returnUrl }),
    }
  )
  if (!res.ok) {
    // PR #499 R1 #5b: parse the JSON error body so the CP's error_hint
    // (already_on_plan, use_portal_for_downgrade, invalid_plan, not_synced,
    // card_declined, stripe_error) survives the throw. Fallback to plain
    // text if the body isn't JSON-parseable.
    let errorHint: string | undefined
    let serverMessage: string | undefined
    let errBody = ''
    try {
      const json = await res.json()
      errorHint = typeof json.error_hint === 'string' ? json.error_hint : json.error
      serverMessage = typeof json.message === 'string' ? json.message : undefined
      errBody = JSON.stringify(json)
    } catch {
      try {
        errBody = await res.text()
      } catch {
        errBody = res.statusText
      }
    }
    throw new CheckoutSessionError({
      status: res.status,
      errorHint,
      serverMessage,
      message: `Checkout session creation failed: ${errBody}`,
    })
  }
  // Note: navigation is the caller's responsibility. Free->Paid returns a
  // Checkout `url` (opened in a new tab by the caller); Paid->Paid returns
  // `{ status: 'upgraded' }` with no url and must NOT trigger navigation.
  const data = (await res.json()) as CheckoutSessionResponse
  return data
}

export const useCreateCheckoutSessionMutation = () =>
  useMutation({
    mutationFn: (vars: CheckoutSessionVariables) => createCheckoutSession(vars),
  })
