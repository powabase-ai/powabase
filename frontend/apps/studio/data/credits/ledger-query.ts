import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query'

import { constructHeaders, fetchHandler, handleFetchError } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'
import type { ResponseError, UseCustomInfiniteQueryOptions } from '@/types'
import { creditsKeys } from './keys'

export type LedgerRow = {
  id: string
  action: string
  project_id: string | null
  quantity: number
  unit_credits: number
  credits: number
  status: string
  ref_type: string | null
  ref_id: string | null
  created_at: string
  // Free-form JSONB blob from the billing service (column `metadata`,
  // ORM attribute `metadata_`). Carries call-specific context — for
  // llm_call rows, the model identifier + token counts. Token counts
  // are NOT rendered in the billing surface (Activity log); they live
  // in the agent trace / debug view per Phase 11.3 spec.
  metadata?: Record<string, unknown> | null
}

export type LedgerPage = {
  org_id: string
  ledger: LedgerRow[]
  next_cursor: string | null
}

export type LedgerFilters = {
  action?: string
  project_id?: string
  start_date?: string
  end_date?: string
  ref_id_substring?: string
  limit?: number
}

function buildQueryString(filters: LedgerFilters, cursor?: string): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  if (cursor) params.set('cursor', cursor)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function getCreditsLedger(
  orgSlug: string,
  filters: LedgerFilters,
  cursor?: string,
  signal?: AbortSignal
): Promise<LedgerPage> {
  const baseUrl = API_URL?.replace('/platform', '')
  const url = `${baseUrl}/platform/organizations/${orgSlug}/credits/ledger${buildQueryString(filters, cursor)}`
  const headers = await constructHeaders()
  const res = await fetchHandler(url, { method: 'GET', headers, signal })

  if (!res.ok) {
    // Route through handleFetchError so 402 is intercepted (insufficient-credits
    // toast) before being converted to a ResponseError. Non-402 errors are
    // wrapped in a ResponseError with status/message preserved.
    throw await handleFetchError(res)
  }

  return res.json() as Promise<LedgerPage>
}

export type CreditsLedgerData = LedgerPage
export type CreditsLedgerError = ResponseError

export const useCreditsLedgerInfiniteQuery = (
  orgSlug: string | undefined,
  filters: LedgerFilters,
  {
    enabled = true,
    ...options
  }: UseCustomInfiniteQueryOptions<
    CreditsLedgerData,
    CreditsLedgerError,
    InfiniteData<CreditsLedgerData>,
    readonly unknown[],
    string | undefined
  > = {}
) =>
  useInfiniteQuery({
    queryKey: creditsKeys.ledger(orgSlug, filters as Record<string, string | undefined>),
    queryFn: ({ signal, pageParam }) =>
      getCreditsLedger(orgSlug!, filters, pageParam as string | undefined, signal),
    enabled: enabled && Boolean(orgSlug),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
    ...options,
  })
