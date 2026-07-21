import { useQuery } from '@tanstack/react-query'

import { constructHeaders } from '@/data/fetchers'
import { API_URL } from '@/lib/constants'

export type CreationEligibility = {
  entitled: boolean
  first_project_free: boolean
  allowed_tiers: string[]
}

export const useProjectCreationEligibilityQuery = (slug?: string) =>
  useQuery<CreationEligibility>({
    queryKey: ['project-creation-eligibility', slug],
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/platform/organizations/${slug}/projects/creation-eligibility`,
        { method: 'GET', headers: await constructHeaders({ 'Content-Type': 'application/json' }) }
      )
      if (!res.ok) throw new Error(`creation-eligibility fetch failed: ${res.status}`)
      return res.json()
    },
    enabled: Boolean(slug),
  })
