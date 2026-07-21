import { useQuery } from '@tanstack/react-query'

import type { PlanTierId } from '@/data/billing/compute-tiers.display'
import { constructHeaders } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'

// Server-priced compute-size row. `prices_by_plan` is the customer-facing
// $/hr (in millicents) per plan, computed server-side from COGS × plan
// margin — the FE never sees COGS or the margin multiplier itself.
export type ComputeSizeRow = {
  id: string
  display_name: string
  postgres_vcpu_millicores: number
  postgres_ram_mib: number
  total_vcpu_millicores: number
  total_ram_mib: number
  bundles: {
    egress_gb: number
    s3_storage_gb: number
    ebs_storage_gb: number
    regular_mau: number
  }
  prices_by_plan: Record<PlanTierId, number>
}

export const useComputeSizesQuery = (slug?: string) =>
  useQuery({
    queryKey: ['compute-sizes', slug],
    queryFn: async (): Promise<ComputeSizeRow[]> => {
      const res = await fetch(`${API_URL}/platform/organizations/${slug}/compute-sizes`, {
        method: 'GET',
        headers: await constructHeaders({ 'Content-Type': 'application/json' }),
      })
      if (!res.ok) throw new Error(`compute-sizes fetch failed: ${res.status}`)
      return (await res.json()).compute_sizes
    },
    enabled: Boolean(slug),
  })
