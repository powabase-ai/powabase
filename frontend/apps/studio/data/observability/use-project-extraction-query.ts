import { useQuery } from "@tanstack/react-query"

import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient"
import { hasAiAuth } from "@/lib/ai-api"
import { observabilityApi } from "@/lib/ai-api/observability-api"
import { observabilityKeys } from "./keys"
import type { ObservabilityRange, StatusCount } from "./types"

// Extraction + indexing status distribution for the project observability page.
//
// Pulls one row of (id, status) per source / indexed_source in a single PostgREST
// call and counts client-side. Earlier this was N HEAD-with-count round-trips
// per dashboard load; that pattern returned 0 across the board for every status
// in some environments (likely a Content-Range header pass-through issue), so
// the donuts always rendered empty. Fetching rows + counting in JS sidesteps
// the count-header path entirely. Bounded by 10k rows — far above the typical
// project's source count.

const EXTRACTION_STATUSES = [
  "pending",
  "extracting",
  "extracted",
  "attention_required",
  "failed",
  "cancelled",
] as const

const INDEX_STATUSES = ["pending", "indexing", "indexed", "failed", "cancelled"] as const

export interface ExtractionIndexingData {
  extractionCounts: StatusCount[]
  indexingCounts: StatusCount[]
}

interface SourceStatusRow {
  extraction_status: string | null
}

interface IndexedSourceStatusRow {
  index_status: string | null
}

function tally(
  rows: { status: string | null }[],
  knownStatuses: readonly string[],
): StatusCount[] {
  const counts: Record<string, number> = {}
  for (const s of knownStatuses) counts[s] = 0
  for (const r of rows) {
    const s = r.status
    if (!s) continue
    counts[s] = (counts[s] ?? 0) + 1
  }
  return Object.entries(counts).map(([status, count]) => ({ status, count }))
}

export function useProjectExtractionQuery(
  range: ObservabilityRange = "7d",
  { enabled = true, refetchIntervalMs = 30_000 }: { enabled?: boolean; refetchIntervalMs?: number } = {},
) {
  const { token, ref, isReady } = useProjectSupabaseClient()

  return useQuery<ExtractionIndexingData>({
    queryKey: observabilityKeys.projectExtraction(ref, range),
    enabled: enabled && isReady && hasAiAuth(token),
    refetchInterval: refetchIntervalMs,
    queryFn: async () => {
      if (!hasAiAuth(token)) throw new Error("Project client not ready")

      const res = await observabilityApi.getExtractionStatus(token, ref)

      const extractionCounts = tally(
        (res.sources as SourceStatusRow[]).map((r) => ({
          status: r.extraction_status,
        })),
        EXTRACTION_STATUSES,
      )
      const indexingCounts = tally(
        (res.indexed_sources as IndexedSourceStatusRow[]).map((r) => ({
          status: r.index_status,
        })),
        INDEX_STATUSES,
      )

      return { extractionCounts, indexingCounts }
    },
  })
}
