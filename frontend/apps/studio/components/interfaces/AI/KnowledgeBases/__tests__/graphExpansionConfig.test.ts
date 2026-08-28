import { describe, it, expect } from "vitest"
import {
  GRAPH_EXPANSION_DEFAULTS,
  buildGraphExpansionConfig,
  readGraphExpansionConfig,
} from "../graphExpansionConfig"

describe("readGraphExpansionConfig", () => {
  it("falls back to defaults when a KB predates the setting", () => {
    expect(readGraphExpansionConfig({ method: "hybrid", top_k: 5 })).toEqual(
      GRAPH_EXPANSION_DEFAULTS
    )
  })

  it("defaults children off and the outline on", () => {
    expect(GRAPH_EXPANSION_DEFAULTS.includeChildren).toBe(false)
    expect(GRAPH_EXPANSION_DEFAULTS.includeDocToc).toBe(true)
  })

  it("surfaces stored values", () => {
    const state = readGraphExpansionConfig({
      graph_expansion: {
        include_children: true,
        max_children_per_parent: 5,
        include_doc_toc: false,
      },
    })

    expect(state).toEqual({
      includeChildren: true,
      maxChildrenPerParent: "5",
      includeDocToc: false,
    })
  })

  it("ignores a non-numeric cap written by an API caller", () => {
    const state = readGraphExpansionConfig({
      graph_expansion: { max_children_per_parent: "lots" },
    })

    expect(state.maxChildrenPerParent).toBe(GRAPH_EXPANSION_DEFAULTS.maxChildrenPerParent)
  })
})

describe("buildGraphExpansionConfig", () => {
  it("emits nothing for strategies without a graph", () => {
    expect(
      buildGraphExpansionConfig("chunk_embed", {
        includeChildren: true,
        maxChildrenPerParent: "2",
        includeDocToc: true,
      })
    ).toEqual({})
  })

  it("emits the nested block for graph_index with a numeric cap", () => {
    expect(
      buildGraphExpansionConfig("graph_index", {
        includeChildren: true,
        maxChildrenPerParent: "2",
        includeDocToc: false,
      })
    ).toEqual({
      graph_expansion: {
        include_children: true,
        max_children_per_parent: 2,
        include_doc_toc: false,
      },
    })
  })

  it("falls back to the default cap rather than writing NaN", () => {
    const built = buildGraphExpansionConfig("graph_index", {
      includeChildren: true,
      maxChildrenPerParent: "",
      includeDocToc: true,
    })

    expect(built.graph_expansion?.max_children_per_parent).toBe(3)
  })
})
