import { describe, it, expect } from "vitest"
import {
  GRAPH_EXPANSION_DEFAULTS,
  buildGraphExpansionConfig,
  isGraphExpansionValid,
  readGraphExpansionConfig,
  serverGraphExpansionDefaults,
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

  it.each([["a string", "off"], ["a number", 5], ["an array", ["children"]], ["null", null]])(
    "falls back to defaults when graph_expansion is %s",
    (_label, block) => {
      expect(readGraphExpansionConfig({ graph_expansion: block })).toEqual(
        GRAPH_EXPANSION_DEFAULTS
      )
    }
  )
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

  it("emits only the keys that differ from the defaults", () => {
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

  it("omits the block entirely when nothing was changed", () => {
    // Matches how perSourceLimits omits its keys at their default: an
    // untouched form must not pin the KB to today's server defaults.
    expect(buildGraphExpansionConfig("graph_index", GRAPH_EXPANSION_DEFAULTS)).toEqual({})
  })

  it("omits the cap while keeping a changed toggle", () => {
    expect(
      buildGraphExpansionConfig("graph_index", {
        ...GRAPH_EXPANSION_DEFAULTS,
        includeDocToc: false,
      })
    ).toEqual({ graph_expansion: { include_doc_toc: false } })
  })

  it("falls back to the default cap rather than writing NaN", () => {
    const built = buildGraphExpansionConfig("graph_index", {
      includeChildren: true,
      maxChildrenPerParent: "",
      includeDocToc: true,
    })

    expect(built.graph_expansion?.max_children_per_parent).toBeUndefined()
    expect(built.graph_expansion?.include_children).toBe(true)
  })
})

describe("isGraphExpansionValid", () => {
  it("passes any state for a strategy without a graph", () => {
    expect(
      isGraphExpansionValid("chunk_embed", {
        includeChildren: true,
        maxChildrenPerParent: "-5",
        includeDocToc: true,
      })
    ).toBe(true)
  })

  it.each(["", "-5", "2.5", "abc"])("rejects a cap of %o", (cap) => {
    expect(
      isGraphExpansionValid("graph_index", {
        includeChildren: true,
        maxChildrenPerParent: cap,
        includeDocToc: true,
      })
    ).toBe(false)
  })

  it("rejects a cap above the ceiling the server enforces", () => {
    expect(
      isGraphExpansionValid("graph_index", {
        includeChildren: true,
        maxChildrenPerParent: "1000000",
        includeDocToc: true,
      })
    ).toBe(false)
  })

  it("guards the cap even when children are switched off", () => {
    // The cap is written whenever it differs from the default, so gating the
    // check on includeChildren would let an invalid value through to the API.
    expect(
      isGraphExpansionValid("graph_index", {
        includeChildren: false,
        maxChildrenPerParent: "-5",
        includeDocToc: true,
      })
    ).toBe(false)
  })
})

describe("serverGraphExpansionDefaults", () => {
  it("prefers the strategy's server-side default_retrieval_config", () => {
    const defaults = serverGraphExpansionDefaults({
      graph_index: {
        default_retrieval_config: {
          graph_expansion: {
            include_children: true,
            max_children_per_parent: 7,
            include_doc_toc: false,
          },
        },
      },
    })

    expect(defaults).toEqual({
      includeChildren: true,
      maxChildrenPerParent: "7",
      includeDocToc: false,
    })
  })

  it("falls back to the local constant when the server does not send the block", () => {
    expect(serverGraphExpansionDefaults({ graph_index: { default_retrieval_config: {} } })).toEqual(
      GRAPH_EXPANSION_DEFAULTS
    )
  })

  it("falls back when the strategy is missing entirely", () => {
    expect(serverGraphExpansionDefaults(undefined)).toEqual(GRAPH_EXPANSION_DEFAULTS)
  })
})

describe("round trip", () => {
  it.each([
    ["3", "3"],
    ["007", "7"],
    ["20", "20"],
  ])("read(build(%o)) yields %o", (cap, expected) => {
    const state = { includeChildren: true, maxChildrenPerParent: cap, includeDocToc: false }
    const built = buildGraphExpansionConfig("graph_index", state)

    expect(readGraphExpansionConfig(built).maxChildrenPerParent).toBe(expected)
  })
})
