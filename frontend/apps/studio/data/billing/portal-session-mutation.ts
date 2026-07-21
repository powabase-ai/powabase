import { useMutation } from '@tanstack/react-query'

import { constructHeaders } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'

export type PortalSessionVariables = {
  slug: string
  returnUrl?: string
}

export type PortalSessionResponse = { url: string }

/** Mirror CheckoutSessionError so the FE has a uniform shape (see PR #499 R1 #5b). */
export class PortalSessionError extends Error {
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
    this.name = 'PortalSessionError'
    this.status = args.status
    this.errorHint = args.errorHint
    this.serverMessage = args.serverMessage
  }
}

export async function createPortalSession(
  args: PortalSessionVariables
): Promise<PortalSessionResponse> {
  // PR #499 R3: route is /org/<slug>/billing (top-level org page).
  const returnUrl = args.returnUrl ?? `/org/${args.slug}/billing`
  // PR #499 R1 #5a: attach Bearer header via constructHeaders (mirror checkout).
  const headers = await constructHeaders({ 'Content-Type': 'application/json' })
  // Route via API_URL — see checkout-session-mutation.ts for the rationale.
  const res = await fetch(
    `${API_URL}/platform/organizations/${args.slug}/billing/portal-session`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ return_url: returnUrl }),
    }
  )
  if (!res.ok) {
    // PR #499 R1 #5b: parse error_hint so the CP's structured error survives.
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
    throw new PortalSessionError({
      status: res.status,
      errorHint,
      serverMessage,
      message: `Portal session creation failed: ${errBody}`,
    })
  }
  // Note: the caller is responsible for navigation (open in a new tab).
  // Previously this did `window.location.href = data.url`, hijacking the
  // current tab; see ManageSubscriptionPanel for the new-tab handoff.
  const data = (await res.json()) as PortalSessionResponse
  return data
}

export const useCreatePortalSessionMutation = () =>
  useMutation({
    mutationFn: (vars: PortalSessionVariables) => createPortalSession(vars),
  })
