import { useMutation, useQueryClient } from '@tanstack/react-query'

import { constructHeaders } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'
import { billingKeys } from './keys'

export type UpdateBillingSettingsVariables = {
  slug: string
  monthlyMaxSpendMillicents: number
}

export async function updateBillingSettings({
  slug,
  monthlyMaxSpendMillicents,
}: UpdateBillingSettingsVariables) {
  const headers = await constructHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch(`${API_URL}/platform/organizations/${slug}/billing/settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ monthly_max_spend_millicents: monthlyMaxSpendMillicents }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `settings update failed: ${res.status}`)
  }
  return res.json()
}

export const useUpdateBillingSettingsMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateBillingSettings,
    onSuccess: (_d, vars) =>
      queryClient.invalidateQueries({ queryKey: billingKeys.wallet(vars.slug) }),
  })
}
