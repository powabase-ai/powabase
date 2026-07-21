import { describe, it, expect } from "vitest"
import { sourcesBadge, enrichmentBadge, anyActive, buildBadges } from "../kbListHelpers"

function kb(overrides: Partial<{
  source_counts: any
  chunk_count: number
  enrichment_status: any
  enrichment_progress: any
  indexing_config: any
}>) {
  return {
    id: "x",
    name: "X",
    description: null,
    indexing_config: {},
    retrieval_config: {},
    created_at: null,
    updated_at: null,
    source_counts: { pending: 0, indexing: 0, indexed: 0, failed: 0, cancelled: 0, total: 0 },
    chunk_count: 0,
    enrichment_status: "none" as const,
    enrichment_progress: null,
    ...overrides,
  } as any
}

describe("sourcesBadge", () => {
  it("returns '0' + default tone when total is 0", () => {
    expect(sourcesBadge(kb({}))).toEqual({ label: "sources", value: "0" })
  })

  it("returns danger tone when any failures", () => {
    const b = sourcesBadge(
      kb({
        source_counts: { pending: 0, indexing: 0, indexed: 5, failed: 2, cancelled: 0, total: 7 },
      }),
    )
    expect(b.tone).toBe("danger")
    expect(b.value).toBe("2 failed · 5/7")
  })

  it("returns info tone when indexing in progress", () => {
    const b = sourcesBadge(
      kb({
        source_counts: { pending: 1, indexing: 2, indexed: 4, failed: 0, cancelled: 0, total: 7 },
      }),
    )
    expect(b.tone).toBe("info")
    expect(b.value).toBe("3 indexing · 4/7")
  })

  it("returns success tone when all done", () => {
    const b = sourcesBadge(
      kb({
        source_counts: { pending: 0, indexing: 0, indexed: 5, failed: 0, cancelled: 0, total: 5 },
      }),
    )
    expect(b.tone).toBe("success")
    expect(b.value).toBe("5/5")
  })
})

describe("enrichmentBadge", () => {
  it("is null when status is none", () => {
    expect(enrichmentBadge(kb({}))).toBeNull()
  })

  it("shows progress when enriching", () => {
    const b = enrichmentBadge(
      kb({
        enrichment_status: "enriching",
        enrichment_progress: { enriched_count: 3, total_count: 10 },
      }),
    )
    expect(b?.value).toBe("enriching 3/10")
    expect(b?.tone).toBe("info")
  })

  it("shows 'enriched' when done", () => {
    const b = enrichmentBadge(kb({ enrichment_status: "enriched" }))
    expect(b?.value).toBe("enriched")
    expect(b?.tone).toBe("success")
  })

  it("shows 'failed' when failed", () => {
    const b = enrichmentBadge(kb({ enrichment_status: "failed" }))
    expect(b?.value).toBe("failed")
    expect(b?.tone).toBe("danger")
  })
})

describe("anyActive", () => {
  it("false when all idle", () => {
    expect(anyActive([kb({})])).toBe(false)
  })

  it("true when indexing > 0", () => {
    expect(
      anyActive([
        kb({
          source_counts: { pending: 0, indexing: 1, indexed: 0, failed: 0, cancelled: 0, total: 1 },
        }),
      ]),
    ).toBe(true)
  })

  it("true when pending > 0", () => {
    expect(
      anyActive([
        kb({
          source_counts: { pending: 1, indexing: 0, indexed: 0, failed: 0, cancelled: 0, total: 1 },
        }),
      ]),
    ).toBe(true)
  })

  it("true when enriching", () => {
    expect(anyActive([kb({ enrichment_status: "enriching" })])).toBe(true)
  })
})

describe("buildBadges", () => {
  it("includes strategy when present in indexing_config", () => {
    const badges = buildBadges(kb({ indexing_config: { strategy: "chunk_embed" } }))
    expect(badges.some((b) => b.value === "chunk_embed")).toBe(true)
  })

  it("always includes sources badge", () => {
    const badges = buildBadges(kb({}))
    expect(badges.some((b) => b.label === "sources")).toBe(true)
  })

  it("includes chunks badge when chunk_count > 0", () => {
    const badges = buildBadges(kb({ chunk_count: 42 }))
    expect(badges.some((b) => b.label === "chunks" && b.value === 42)).toBe(true)
  })

  it("hides chunks badge when chunk_count is 0", () => {
    const badges = buildBadges(kb({ chunk_count: 0 }))
    expect(badges.some((b) => b.label === "chunks")).toBe(false)
  })
})
