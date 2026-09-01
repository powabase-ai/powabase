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

  it.each([["a truthy string", "false"], ["a number", 1], ["zero", 0], ["an array", []]])(
    "ignores %s in a boolean field rather than coercing it",
    (_label, stored) => {
      // Coercing is what makes the two sides disagree about a stored value:
      // "false" is truthy in JS, 0 is falsy, and Python reads neither as a
      // bool. Both fields must land on their own default, not on the value's
      // truthiness — note the two defaults differ, so a coercing
      // implementation cannot pass both assertions.
      const state = readGraphExpansionConfig({
        graph_expansion: { include_children: stored, include_doc_toc: stored },
      })

      expect(state.includeChildren).toBe(false)
      expect(state.includeDocToc).toBe(true)
    }
  )

  it("truncates a stored float rather than displaying it", () => {
    expect(
      readGraphExpansionConfig({ graph_expansion: { max_children_per_parent: 3.7 } })
        .maxChildrenPerParent
    ).toBe(GRAPH_EXPANSION_DEFAULTS.maxChildrenPerParent)
  })

  it.each([
    ["below the floor", -5, "0"],
    ["above the ceiling", 50, "20"],
  ])("clamps a cap %s the way the server does", (_label, stored, expected) => {
    // Falling back to the default here would display a number the KB does
    // not use: the server clamps, so -5 means 0 and 50 means 20.
    expect(
      readGraphExpansionConfig({ graph_expansion: { max_children_per_parent: stored } })
        .maxChildrenPerParent
    ).toBe(expected)
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
  it("emits nothing for a section the operator never touched", () => {
    expect(buildGraphExpansionConfig("graph_index", null)).toEqual({})
  })

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
  it("passes an untouched section", () => {
    expect(isGraphExpansionValid("graph_index", null)).toBe(true)
  })

  it("accepts a cap of zero, which disables children explicitly", () => {
    expect(
      isGraphExpansionValid("graph_index", {
        includeChildren: true,
        maxChildrenPerParent: "0",
        includeDocToc: true,
      })
    ).toBe(true)
  })

  it("accepts a valid in-range cap", () => {
    expect(
      isGraphExpansionValid("graph_index", {
        includeChildren: true,
        maxChildrenPerParent: "7",
        includeDocToc: true,
      })
    ).toBe(true)
  })

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
    ["007", "7"],
    ["20", "20"],
    [" 4 ", "4"],
    ["+5", "5"],
  ])("read(build(%o)) yields %o", (cap, expected) => {
    const state = { includeChildren: true, maxChildrenPerParent: cap, includeDocToc: false }
    const built = buildGraphExpansionConfig("graph_index", state)

    expect(readGraphExpansionConfig(built).maxChildrenPerParent).toBe(expected)
  })
})
