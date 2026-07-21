import { useQuery } from '@tanstack/react-query'

import { constructHeaders, fetchHandler, handleFetchError } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'
import type { ResponseError, UseCustomQueryOptions } from '@/types'
import { creditsKeys } from './keys'

export type CreditsLimits = {
  org_id: string
  plan_id: string
  monthly_credits: number
  balance: number
  renews_at: string
}

export async function getCreditsLimits(orgSlug: string, signal?: AbortSignal): Promise<CreditsLimits> {
  const baseUrl = API_URL?.replace('/platform', '')
  const url = `${baseUrl}/platform/organizations/${orgSlug}/credits/limits`
  const headers = await constructHeaders()
  const res = await fetchHandler(url, { method: 'GET', headers, signal })

  if (!res.ok) {
    // Route through handleFetchError so 402 is intercepted (insufficient-credits
    // toast) before being converted to a ResponseError. Non-402 errors are
    // wrapped in a ResponseError with status/message preserved.
    throw await handleFetchError(res)
  }

  return res.json() as Promise<CreditsLimits>
}

export type CreditsLimitsData = CreditsLimits
export type CreditsLimitsError = ResponseError

export const useCreditsLimitsQuery = <TData = CreditsLimitsData>(
  orgSlug: string | undefined,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<CreditsLimitsData, CreditsLimitsError, TData> = {}
) =>
  useQuery<CreditsLimitsData, CreditsLimitsError, TData>({
    queryKey: creditsKeys.limits(orgSlug),
    queryFn: ({ signal }) => getCreditsLimits(orgSlug!, signal),
    enabled: enabled && Boolean(orgSlug),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    ...options,
  })
