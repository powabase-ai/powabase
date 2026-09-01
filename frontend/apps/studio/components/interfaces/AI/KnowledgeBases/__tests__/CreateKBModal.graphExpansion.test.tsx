/**
 * Submit-payload tests for the GraphIndex expansion block.
 *
 * The helper unit tests pass `state` and `defaults` from the same source, so
 * they structurally cannot see the two things that actually go wrong here:
 * state that outlives a form reset, and state seeded from defaults that
 * arrive one render later. Both show up only in what gets submitted.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CreateKBModal } from "../CreateKBModal"

const { mockCreate, mockDefaults } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  // `first` is what the hook returns on the very first render and `current`
  // what it swaps to once the request lands — the real useKBDefaults does
  // exactly this (FALLBACK_DEFAULTS, then the server payload). Seeding state
  // once at mount would freeze it on `first` while comparisons moved on.
  mockDefaults: { first: null as unknown, current: null as unknown },
}))

vi.mock("common", () => ({ useParams: () => ({ ref: "proj-1" }) }))

vi.mock("@/hooks/ai/useProjectSupabaseClient", () => ({
  useProjectSupabaseClient: () => ({ token: "tok", isReady: true }),
}))

vi.mock("@/lib/ai-api", () => ({
  hasAiAuth: () => true,
  knowledgeBasesApi: { create: mockCreate },
}))

vi.mock("@/hooks/useKBDefaults", () => ({
  useKBDefaults: () => {
    const [defaults, setDefaults] = React.useState(mockDefaults.first)
    React.useEffect(() => {
      setDefaults(mockDefaults.current)
    }, [])
    return { defaults, isLoading: false }
  },
}))

/** Minimal KBDefaults; only the graph_index strategy matters here. */
function buildDefaults(graphExpansion?: Record<string, unknown>) {
  const strategy = (extra: Record<string, unknown> = {}) => ({
    label: "s",
    compatible_retrievers: ["hybrid"],
    retriever_labels: { hybrid: "Hybrid" },
    default_retrieval_method: "hybrid",
    supports_reranker: true,
    default_indexing_config: { embedding_model: "text-embedding-3-small" },
    default_retrieval_config: { method: "hybrid", top_k: 5, ...extra },
  })

  return {
    strategies: {
      chunk_embed: strategy(),
      page_index: strategy(),
      full_document: strategy(),
      doc2json: strategy(),
      graph_index: strategy(graphExpansion ? { graph_expansion: graphExpansion } : {}),
    },
    reranker: { default_model: "m", candidate_count: 20, options: [] },
    hybrid_vector_weight: 0.5,
    query_enrichment: { model: "gpt-5-mini" },
  }
}

/** The strategy <select> is the first one rendered and carries no label
 * association, so it is addressed positionally rather than by accessible
 * name. */
function strategySelect(container: HTMLElement) {
  return container.querySelector("select") as HTMLSelectElement
}

async function createGraphKb(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  name: string
) {
  await user.type(screen.getByLabelText(/name/i), name)
  await user.selectOptions(strategySelect(container), "graph_index")
  await submitForm(container)
}

/** jsdom does not submit a form from a button click, so the submit event is
 * dispatched directly. */
async function submitForm(container: HTMLElement) {
  fireEvent.submit(container.querySelector("form") as HTMLFormElement)
  await waitFor(() => expect(mockCreate).toHaveBeenCalled())
}

function submittedGraphExpansion(call = 0) {
  return mockCreate.mock.calls[call][2].retrieval_config.graph_expansion
}

describe("CreateKBModal graph expansion payload", () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ id: "kb-1" })
    mockDefaults.first = buildDefaults()
    mockDefaults.current = buildDefaults()
  })

  it("omits the block when the operator changed nothing", async () => {
    const user = userEvent.setup()
    const { container } = render(<CreateKBModal open onOpenChange={() => {}} />)

    await createGraphKb(user, container, "untouched")

    expect(submittedGraphExpansion()).toBeUndefined()
  })

  it("omits the block when server defaults differ from the local constant", async () => {
    // useKBDefaults returns FALLBACK_DEFAULTS first and the server block a
    // render later. State seeded once at mount would stay on the constant
    // while `defaults` moved, and every key would then read as changed.
    // The block arrives only in the second payload, as it does in production.
    mockDefaults.current = buildDefaults({
      include_children: true,
      max_children_per_parent: 5,
      include_doc_toc: false,
    })
    const user = userEvent.setup()
    const { container } = render(<CreateKBModal open onOpenChange={() => {}} />)

    await createGraphKb(user, container, "server defaults")

    expect(submittedGraphExpansion()).toBeUndefined()
  })

  it("submits only the toggle the operator actually changed", async () => {
    const user = userEvent.setup()
    const { container } = render(<CreateKBModal open onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText(/name/i), "children on")
    await user.selectOptions(strategySelect(container), "graph_index")
    fireEvent.click(screen.getByRole("checkbox", { name: /include child sections/i }))
    await submitForm(container)

    expect(submittedGraphExpansion()).toEqual({ include_children: true })
  })

  it("does not carry one knowledge base's settings into the next", async () => {
    const user = userEvent.setup()
    const { container } = render(<CreateKBModal open onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText(/name/i), "first")
    await user.selectOptions(strategySelect(container), "graph_index")
    fireEvent.click(screen.getByRole("checkbox", { name: /include child sections/i }))
    await user.clear(screen.getByLabelText(/max children/i))
    await user.type(screen.getByLabelText(/max children/i), "9")
    await submitForm(container)

    await createGraphKb(user, container, "second")

    expect(submittedGraphExpansion(1)).toBeUndefined()
  })
})
