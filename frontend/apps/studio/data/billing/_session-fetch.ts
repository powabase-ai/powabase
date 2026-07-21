import { constructHeaders } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'

/**
 * Error thrown on a non-2xx billing-session response. Carries the CP's
 * structured `errorHint` (error_hint/error — e.g. amount_too_small,
 * not_owner, stripe_error, billing_disabled) and `serverMessage` so an
 * onError handler can toast a useful string. Mirrors CheckoutSessionError.
 */
export class BillingSessionError extends Error {
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
    this.name = 'BillingSessionError'
    this.status = args.status
    this.errorHint = args.errorHint
    this.serverMessage = args.serverMessage
  }
}

/**
 * POST a billing Checkout/Setup session request, throw BillingSessionError on
 * a non-2xx (parsing the CP's structured error_hint/error + message), then
 * redirect the browser to the returned Stripe URL. Shared by the top-up and
 * standalone add-card session mutations — identical request/error/redirect
 * shape, differing only in path + body + the human failure label.
 */
export async function postBillingSession(
  path: string,
  body: Record<string, unknown>,
  failureLabel: string
): Promise<{ url: string }> {
  const headers = await constructHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
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
    throw new BillingSessionError({
      status: res.status,
      errorHint,
      serverMessage,
      message: `${failureLabel}: ${errBody}`,
    })
  }
  const data = (await res.json()) as { url: string }
  window.location.href = data.url
  return data
}
