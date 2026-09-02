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
  maxReferencedNodes: string
  includeDocToc: boolean
}

export interface GraphExpansionConfig {
  include_children: boolean
  max_children_per_parent: number
  max_referenced_nodes: number
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
  maxReferencedNodes: "10",
  includeDocToc: true,
}

/**
 * Upper bound on the cap. The server clamps to the same ceiling; without one,
 * a cap of a million restores the unbounded fan-out the feature removes.
 */
export const GRAPH_MAX_CHILDREN_CEILING = 20

/** Ceiling on how many referenced sections one search pulls in. References
 * are expansion's largest cost — a single densely-referencing section can
 * pull more than the whole context budget. */
export const GRAPH_MAX_REFERENCED_CEILING = 100

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

/**
 * The two numeric fields, each with its own bound. They are deliberately
 * different: 50 referenced sections is a plausible setting for a large
 * corpus, 50 children per referenced section is not.
 */
const NUMERIC_FIELDS = [
  {
    form: "maxChildrenPerParent",
    api: "max_children_per_parent",
    ceiling: GRAPH_MAX_CHILDREN_CEILING,
  },
  {
    form: "maxReferencedNodes",
    api: "max_referenced_nodes",
    ceiling: GRAPH_MAX_REFERENCED_CEILING,
  },
] as const

/**
 * Read a stored cap the way the server does: clamp a real integer into
 * `[0, ceiling]`, fall back only for values it would ignore. Falling back on
 * an out-of-range value instead would display a number the KB does not
 * actually use — `-5` means 0 on the server, and `50` means 20 for children.
 * `Number.isInteger` is true for `1e21`, which Python reads as a float and
 * ignores, so the range check carries that case too.
 */
function coerceCap(value: unknown, fallback: string, ceiling: number): string {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback
  return String(Math.min(Math.max(0, value), ceiling))
}

/** A form value is savable when it is a whole number within `[0, ceiling]`. */
function capIsInRange(raw: string, ceiling: number): boolean {
  const n = Number(raw)
  return raw.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= ceiling
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
      GRAPH_EXPANSION_DEFAULTS.maxChildrenPerParent,
      GRAPH_MAX_CHILDREN_CEILING
    ),
    maxReferencedNodes: coerceCap(
      block.max_referenced_nodes,
      GRAPH_EXPANSION_DEFAULTS.maxReferencedNodes,
      GRAPH_MAX_REFERENCED_CEILING
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
    maxChildrenPerParent: coerceCap(
      cfg.max_children_per_parent,
      defaults.maxChildrenPerParent,
      GRAPH_MAX_CHILDREN_CEILING
    ),
    maxReferencedNodes: coerceCap(
      cfg.max_referenced_nodes,
      defaults.maxReferencedNodes,
      GRAPH_MAX_REFERENCED_CEILING
    ),
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
  state: GraphExpansionFormState | null,
  defaults: GraphExpansionFormState = GRAPH_EXPANSION_DEFAULTS
): boolean {
  if (indexingStrategy !== "graph_index" || state === null) return true

  // Each field is checked only when it differs from its default, because that
  // is the same condition `build` writes it under.
  return NUMERIC_FIELDS.every(
    ({ form, ceiling }) =>
      state[form] === defaults[form] || capIsInRange(state[form], ceiling)
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
  state: GraphExpansionFormState | null,
  defaults: GraphExpansionFormState = GRAPH_EXPANSION_DEFAULTS
): { graph_expansion?: Partial<GraphExpansionConfig> } {
  if (indexingStrategy !== "graph_index") return {}
  // `null` means the operator never touched the section. Inferring that from
  // a state-vs-defaults diff instead would write all three keys whenever the
  // defaults moved after mount, which is exactly what happens: the server's
  // values arrive a render after the local fallback.
  if (state === null) return {}

  const block: Partial<GraphExpansionConfig> = {}

  if (state.includeChildren !== defaults.includeChildren) {
    block.include_children = state.includeChildren
  }
  if (state.includeDocToc !== defaults.includeDocToc) {
    block.include_doc_toc = state.includeDocToc
  }
  for (const { form, api, ceiling } of NUMERIC_FIELDS) {
    if (state[form] !== defaults[form] && capIsInRange(state[form], ceiling)) {
      block[api] = Number(state[form])
    }
  }

  return Object.keys(block).length > 0 ? { graph_expansion: block } : {}
}
