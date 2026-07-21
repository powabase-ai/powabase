import { constructHeaders, fetchHandler, handleFetchError } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'
import type { ResponseError } from '@/types'

export type CreditsBalance = {
  org_id: string
  balance: number
  renews_at: string // ISO8601 UTC
}

export async function getCreditsBalance(orgSlug: string, signal?: AbortSignal): Promise<CreditsBalance> {
  const baseUrl = API_URL?.replace('/platform', '')
  const url = `${baseUrl}/platform/organizations/${orgSlug}/credits/balance`
  const headers = await constructHeaders()
  const res = await fetchHandler(url, { method: 'GET', headers, signal })

  if (!res.ok) {
    // Route through handleFetchError so 402 is intercepted (insufficient-credits
    // toast) before being converted to a ResponseError. Non-402 errors are
    // wrapped in a ResponseError with status/message preserved.
    throw await handleFetchError(res)
  }

  return res.json() as Promise<CreditsBalance>
}

export type CreditsBalanceData = CreditsBalance
export type CreditsBalanceError = ResponseError

// Note: a React Query hook (`useCreditsBalanceQuery`) previously lived here
// with a 120s polling cadence. It was unused — no Studio surface fetches the
// balance directly today; the credits page uses `useCreditsLimitsQuery` which
// already includes the balance. Removed in 2026-05 cleanup. If a future
// surface needs a balance-only hook, the fetcher + types above are sufficient
// to add it back; see git history (data/credits/keys.ts still exposes the
// `balance` key for invalidation).
