import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { ResponseError } from "@/types"
import { adminKeys } from "./keys"

export interface AdminProjectActivityRow {
  action: string
  status: string
  /** Signed millicents: grants positive, charges negative (100_000 = $1). */
  millicents: number
  created_at: string | null
  model: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
}

export interface AdminProjectActivitySummary {
  action: string
  count: number
  total_millicents: number
}

export interface AdminProjectDetail {
  project: {
    id: string
    name: string
    slug: string
    ref: string | null
    organization_id: string
    state: string | null
    paused_at: string | null
    created_at: string | null
  }
  org: { name: string; slug: string }
  members: Array<{ user_id: string; email: string; role: string; created_at: string | null }>
  /** Recent credit_ledger rows scoped to this project (CP-visible activity). */
  activity: AdminProjectActivityRow[]
  activity_summary: AdminProjectActivitySummary[]
}

export function useAdminProjectQuery(ref: string | undefined) {
  return useQuery<AdminProjectDetail>({
    queryKey: adminKeys.project(ref ?? ""),
    enabled: !!ref,
    queryFn: async () => {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/platform/admin/projects/${ref}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new ResponseError(`project detail failed: ${res.status}`, res.status)
      return res.json()
    },
  })
}
