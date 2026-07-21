import { useQuery } from '@tanstack/react-query'

import { constructHeaders } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'
import { billingKeys } from './keys'

export type WalletResponse = {
  balance_millicents: number
  cycle_spent_millicents: number
  cycle_start: string
  monthly_max_spend_millicents: number
  cap_set: boolean
  card_on_file: boolean
  default_payment_method_set: boolean
  plan_id: string
  is_paid: boolean
  monthly_grant_millicents: number
  renews_at: string | null
  payment_status: 'ok' | 'past_due' | 'grace' | 'paused' | 'canceled' | 'card_failed'
  grace_entered_at: string | null
  grace_consumed_millicents: number
}

export async function getWallet(slug: string): Promise<WalletResponse> {
  const headers = await constructHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch(`${API_URL}/platform/organizations/${slug}/billing/wallet`, { headers })
  if (!res.ok) throw new Error(`wallet fetch failed: ${res.status}`)
  return (await res.json()) as WalletResponse
}

export const useOrgWalletQuery = (
  slug: string | undefined,
  { enabled = true }: { enabled?: boolean } = {}
) =>
  useQuery({
    queryKey: billingKeys.wallet(slug),
    queryFn: () => getWallet(slug!),
    enabled: enabled && !!slug,
    refetchInterval: 60_000,
  })
