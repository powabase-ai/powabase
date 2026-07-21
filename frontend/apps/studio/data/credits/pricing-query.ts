import { useQuery } from '@tanstack/react-query'

import { constructHeaders, fetchHandler, handleFetchError } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'
import type { ResponseError, UseCustomQueryOptions } from '@/types'
import { creditsKeys } from './keys'

export type PricingRow = {
  action: string
  unit_credits: number
  unit_label: string
  description: string | null
  // Optional today — added in v1.5 (Phase 1 migration). Backend response will
  // include it after Task 10.5; callers default to 'fixed' if absent.
  cost_model?: 'fixed' | 'llm_passthrough'
}

export type PricingResponse = {
  pricing: PricingRow[]
}

export async function getPricing(signal?: AbortSignal): Promise<PricingResponse> {
  const baseUrl = API_URL?.replace('/platform', '')
  const url = `${baseUrl}/platform/credits/pricing`
  const headers = await constructHeaders()
  const res = await fetchHandler(url, { method: 'GET', headers, signal })

  if (!res.ok) {
    // Route through handleFetchError so 402 is intercepted (insufficient-credits
    // toast) before being converted to a ResponseError. Non-402 errors are
    // wrapped in a ResponseError with status/message preserved.
    throw await handleFetchError(res)
  }

  return res.json() as Promise<PricingResponse>
}

export type PricingData = PricingResponse
export type PricingError = ResponseError

/**
 * Pricing rarely changes (only on migration). Heavily cached so the
 * 3 expensive-op tooltips and the Pricing page don't refetch
 * unnecessarily.
 */
export const usePricingQuery = <TData = PricingData>(
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<PricingData, PricingError, TData> = {}
) =>
  useQuery<PricingData, PricingError, TData>({
    queryKey: creditsKeys.pricing(),
    queryFn: ({ signal }) => getPricing(signal),
    enabled,
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    ...options,
  })
