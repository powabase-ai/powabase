/**
 * Single source of truth for guide-bubble anchor ids.
 *
 * Target UI elements carry `data-onboarding-id="<value>"`; the guide engine
 * resolves an anchor to a live DOMRect via `document.querySelector`. Centralising
 * the strings here (imported by both the JSX and the sequence registry) keeps
 * them greppable and typo-proof. A CI grep can assert every value below exists in
 * the codebase to catch silent removals.
 *
 * Adding an anchor — the target MUST generate a layout box. `useAnchorRect`
 * only "finds" an element once it has a non-zero `getBoundingClientRect()`
 * (a `display:contents` / zero-size / hidden node is skipped, so the spotlight
 * never appears and the step waits forever). So:
 *   - Spread `{...onboardingAnchor(...)}` directly onto a shared component that
 *     forwards rest-props to a real DOM node (`Button`, `Input`, `ButtonTooltip`,
 *     `TabsTrigger`) — verified prop-forwarding, no wrapper needed.
 *   - For a custom component whose forwarding is unverified, wrap it in a
 *     BOX-GENERATING element — `<span className="inline-flex" {...onboardingAnchor(...)}>` —
 *     NOT `className="contents"` (contents produces no box → un-highlightable).
 */
export const ONBOARDING_ANCHORS = {
  connect: { button: 'connect.button' },
  sources: {
    newButton: 'sources.new-button',
    search: 'sources.search',
    list: 'sources.list',
  },
  tables: {
    newTableButton: 'tables.new-table-button',
    name: 'tables.name',
    addColumn: 'tables.add-column',
    rls: 'tables.rls',
  },
  knowledgeBases: {
    createButton: 'kb.create-button',
    indexingStrategy: 'kb.indexing-strategy',
    detailAddSources: 'kb.detail-add-sources',
  },
  agents: {
    createButton: 'agents.create-button',
    tabOverview: 'agents.tab-overview',
    tabKnowledgeBases: 'agents.tab-knowledge-bases',
    tabTools: 'agents.tab-tools',
    save: 'agents.save',
  },
  sql: { newQuery: 'sql.new-query', run: 'sql.run' },
  storage: { newBucket: 'storage.new-bucket', upload: 'storage.upload' },
  auth: {
    addUser: 'auth.add-user',
    newPolicy: 'auth.new-policy',
    providers: 'auth.providers',
  },
  database: {
    schemaVisualizer: 'database.schema-visualizer',
    newFunction: 'database.new-function',
    newTrigger: 'database.new-trigger',
    createIndex: 'database.create-index',
    addRole: 'database.add-role',
    extensions: 'database.extensions',
  },
  orchestrations: { createButton: 'orchestrations.create-button' },
  workflows: { createButton: 'workflows.create-button' },
  realtime: { inspector: 'realtime.inspector' },
  settings: { llmKeys: 'settings.llm-keys' },
  compute: { tiers: 'compute.tiers', resize: 'compute.resize' },
} as const

type AnchorGroups = typeof ONBOARDING_ANCHORS
/** Union of every anchor id value (auto-derived from the groups above). */
export type OnboardingAnchorId = {
  [G in keyof AnchorGroups]: AnchorGroups[G][keyof AnchorGroups[G]]
}[keyof AnchorGroups]

/** The DOM attribute name target elements use. */
export const ONBOARDING_ATTR = 'data-onboarding-id'

/** Build the props to spread onto a target element, e.g.
 *  `<Button {...onboardingAnchor(ONBOARDING_ANCHORS.tables.newTableButton)} />`. */
export const onboardingAnchor = (id: OnboardingAnchorId) => ({ [ONBOARDING_ATTR]: id })
