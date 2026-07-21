import type { HorizontalCardBadgeSpec } from "@/components/interfaces/AI/Shared/HorizontalCard"
import type { KnowledgeBaseListItem } from "@/lib/ai-api"

/** Format the strategy chip from indexing_config. */
export function strategyBadge(kb: KnowledgeBaseListItem): HorizontalCardBadgeSpec | null {
  const strategy = (kb.indexing_config as { strategy?: string })?.strategy
  if (!strategy) return null
  return { label: "strategy", value: strategy }
}

/** Compute the sources badge based on source_counts state. */
export function sourcesBadge(kb: KnowledgeBaseListItem): HorizontalCardBadgeSpec {
  const c = kb.source_counts
  if (c.total === 0) return { label: "sources", value: "0" }
  if (c.failed > 0) {
    return {
      label: "sources",
      value: `${c.failed} failed · ${c.indexed}/${c.total}`,
      tone: "danger",
    }
  }
  if (c.indexing + c.pending > 0) {
    return {
      label: "sources",
      value: `${c.indexing + c.pending} indexing · ${c.indexed}/${c.total}`,
      tone: "info",
    }
  }
  return { label: "sources", value: `${c.indexed}/${c.total}`, tone: "success" }
}

/** Hidden when 0. */
export function chunksBadge(kb: KnowledgeBaseListItem): HorizontalCardBadgeSpec | null {
  if (kb.chunk_count === 0) return null
  return { label: "chunks", value: kb.chunk_count }
}

/** Hidden when status is 'none'. */
export function enrichmentBadge(kb: KnowledgeBaseListItem): HorizontalCardBadgeSpec | null {
  if (kb.enrichment_status === "none") return null
  if (kb.enrichment_status === "enriching" && kb.enrichment_progress) {
    return {
      label: "enrichment",
      value: `enriching ${kb.enrichment_progress.enriched_count}/${kb.enrichment_progress.total_count}`,
      tone: "info",
    }
  }
  if (kb.enrichment_status === "enriched") {
    return { label: "enrichment", value: "enriched", tone: "success" }
  }
  if (kb.enrichment_status === "failed") {
    return { label: "enrichment", value: "failed", tone: "danger" }
  }
  return null
}

/** Build the full badge list. */
export function buildBadges(kb: KnowledgeBaseListItem): HorizontalCardBadgeSpec[] {
  const result: HorizontalCardBadgeSpec[] = []
  const strategy = strategyBadge(kb)
  if (strategy) result.push(strategy)
  result.push(sourcesBadge(kb))
  const chunks = chunksBadge(kb)
  if (chunks) result.push(chunks)
  const enrich = enrichmentBadge(kb)
  if (enrich) result.push(enrich)
  return result
}

/** Returns true if any visible KB has active indexing or enrichment. */
export function anyActive(kbs: KnowledgeBaseListItem[]): boolean {
  return kbs.some(
    (kb) =>
      kb.source_counts.indexing > 0 ||
      kb.source_counts.pending > 0 ||
      kb.enrichment_status === "enriching",
  )
}
