/**
 * GraphIndex expansion settings — the `retrieval_config.graph_expansion` block.
 *
 * At search time a GraphIndex hit pulls in the sections it explicitly
 * references. Those referenced sections' children are opt-in: by default the
 * document outline ships instead, which names every section without paying
 * for its text. These helpers translate that block to and from form state.
 */

export interface GraphExpansionFormState {
  includeChildren: boolean
  maxChildrenPerParent: string
  includeDocToc: boolean
}

export interface GraphExpansionConfig {
  include_children: boolean
  max_children_per_parent: number
  include_doc_toc: boolean
}

/** Mirrors the server-side defaults in the project-service strategy registry. */
export const GRAPH_EXPANSION_DEFAULTS: GraphExpansionFormState = {
  includeChildren: false,
  maxChildrenPerParent: "3",
  includeDocToc: true,
}

function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

/**
 * Read form state out of a stored retrieval_config. Typed loosely on purpose:
 * this is JSONB an API caller can have written anything into, so every field
 * is checked rather than trusted.
 */
export function readGraphExpansionConfig(
  retrievalConfig: Record<string, unknown> | null | undefined
): GraphExpansionFormState {
  const cfg = (retrievalConfig?.graph_expansion ?? {}) as Partial<GraphExpansionConfig>
  const cap = cfg.max_children_per_parent

  return {
    includeChildren: coerceBool(cfg.include_children, GRAPH_EXPANSION_DEFAULTS.includeChildren),
    maxChildrenPerParent:
      typeof cap === "number" && Number.isInteger(cap) && cap >= 0
        ? String(cap)
        : GRAPH_EXPANSION_DEFAULTS.maxChildrenPerParent,
    includeDocToc: coerceBool(cfg.include_doc_toc, GRAPH_EXPANSION_DEFAULTS.includeDocToc),
  }
}

/**
 * Build the block to send on create/update. Returns `{}` for strategies with
 * no graph, so callers can spread it unconditionally.
 */
export function buildGraphExpansionConfig(
  indexingStrategy: string,
  state: GraphExpansionFormState
): { graph_expansion?: GraphExpansionConfig } {
  if (indexingStrategy !== "graph_index") return {}

  const cap = Number(state.maxChildrenPerParent)

  return {
    graph_expansion: {
      include_children: state.includeChildren,
      max_children_per_parent:
        state.maxChildrenPerParent.trim() !== "" && Number.isInteger(cap) && cap >= 0
          ? cap
          : Number(GRAPH_EXPANSION_DEFAULTS.maxChildrenPerParent),
      include_doc_toc: state.includeDocToc,
    },
  }
}
