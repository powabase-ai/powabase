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

/**
 * Last-resort defaults, used only when the server's `default_retrieval_config`
 * carries no `graph_expansion` block — see `serverGraphExpansionDefaults`.
 * They mirror `strategies/graph_defaults.py`.
 */
export const GRAPH_EXPANSION_DEFAULTS: GraphExpansionFormState = {
  includeChildren: false,
  maxChildrenPerParent: "3",
  includeDocToc: true,
}

/**
 * Upper bound on the cap. The server clamps to the same ceiling; without one,
 * a cap of a million restores the unbounded fan-out the feature removes.
 */
export const GRAPH_MAX_CHILDREN_CEILING = 20

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function coerceCap(value: unknown, fallback: string): string {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? String(value)
    : fallback
}

/**
 * Defaults for a new KB, preferring what the server actually ships over the
 * local constant — the strategy registry owns these values, and hardcoding
 * them here would silently ignore a server-side change.
 */
export function serverGraphExpansionDefaults(
  strategies: Record<string, { default_retrieval_config?: Record<string, unknown> }> | undefined
): GraphExpansionFormState {
  const block = asRecord(strategies?.graph_index?.default_retrieval_config?.graph_expansion)

  return {
    includeChildren: coerceBool(
      block.include_children,
      GRAPH_EXPANSION_DEFAULTS.includeChildren
    ),
    maxChildrenPerParent: coerceCap(
      block.max_children_per_parent,
      GRAPH_EXPANSION_DEFAULTS.maxChildrenPerParent
    ),
    includeDocToc: coerceBool(block.include_doc_toc, GRAPH_EXPANSION_DEFAULTS.includeDocToc),
  }
}

/**
 * Read form state out of a stored retrieval_config. Typed loosely on purpose:
 * this is JSONB an API caller can have written anything into, so every field
 * is checked rather than trusted. Absent keys read as the defaults the server
 * applies to the same config, so a KB saved before this setting existed shows
 * what it actually does.
 */
export function readGraphExpansionConfig(
  retrievalConfig: Record<string, unknown> | null | undefined,
  defaults: GraphExpansionFormState = GRAPH_EXPANSION_DEFAULTS
): GraphExpansionFormState {
  const cfg = asRecord(retrievalConfig?.graph_expansion)

  return {
    includeChildren: coerceBool(cfg.include_children, defaults.includeChildren),
    maxChildrenPerParent: coerceCap(cfg.max_children_per_parent, defaults.maxChildrenPerParent),
    includeDocToc: coerceBool(cfg.include_doc_toc, defaults.includeDocToc),
  }
}

/**
 * True when this state is safe to save. The cap is checked whenever it differs
 * from the default — not only when children are on — because `build` writes it
 * on that same condition.
 */
export function isGraphExpansionValid(
  indexingStrategy: string,
  state: GraphExpansionFormState,
  defaults: GraphExpansionFormState = GRAPH_EXPANSION_DEFAULTS
): boolean {
  if (indexingStrategy !== "graph_index") return true
  if (state.maxChildrenPerParent === defaults.maxChildrenPerParent) return true

  const cap = Number(state.maxChildrenPerParent)
  return (
    state.maxChildrenPerParent.trim() !== "" &&
    Number.isInteger(cap) &&
    cap >= 0 &&
    cap <= GRAPH_MAX_CHILDREN_CEILING
  )
}

/**
 * Build the block to send on create/update. Returns `{}` for strategies with
 * no graph, so callers can spread it unconditionally.
 *
 * Only keys that differ from `defaults` are emitted, matching how
 * `perSourceLimits` omits its keys at their default: an untouched form must
 * not pin a KB to today's server defaults, and the stored JSONB should keep
 * saying which values the operator actually chose.
 */
export function buildGraphExpansionConfig(
  indexingStrategy: string,
  state: GraphExpansionFormState,
  defaults: GraphExpansionFormState = GRAPH_EXPANSION_DEFAULTS
): { graph_expansion?: Partial<GraphExpansionConfig> } {
  if (indexingStrategy !== "graph_index") return {}

  const block: Partial<GraphExpansionConfig> = {}

  if (state.includeChildren !== defaults.includeChildren) {
    block.include_children = state.includeChildren
  }
  if (state.includeDocToc !== defaults.includeDocToc) {
    block.include_doc_toc = state.includeDocToc
  }
  if (
    state.maxChildrenPerParent !== defaults.maxChildrenPerParent &&
    isGraphExpansionValid(indexingStrategy, state, defaults)
  ) {
    block.max_children_per_parent = Number(state.maxChildrenPerParent)
  }

  return Object.keys(block).length > 0 ? { graph_expansion: block } : {}
}
