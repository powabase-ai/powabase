import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customRender as render } from '@/tests/lib/custom-render'
import RunsPage from '@/pages/project/[ref]/runs/index'

// This mounts the actual runs page (not a mock shell) so the assertions
// below pin real call-site behavior: what streamAgentRun is invoked with,
// and how the KB picker's selection and its disabled-rendering react to a
// successful send, an SSE `error` event, a rejected fetch, and the picker's
// own render guards (streaming freeze, over-cap freeze).
// `RunsPage.getLayout` (DefaultLayout/AILayout) is a Next.js page-level
// concern applied by _app.tsx, not by the component itself, so rendering
// `<RunsPage />` directly exercises the real component with no layout stub
// needed.
//
// Unlike the over-cap guard test (moved to index.overcap.test.tsx), this
// file does NOT mock 'ui' — the KB checkboxes are the real Radix
// `Checkbox_Shadcn_`, so `disabled` here is the genuine rendered attribute,
// not a re-implementation of it. That's required for the two render-guard
// tests below and is also just more honest coverage for the other tests.

const twoKbs = [
  { id: 'kb-1', name: 'KB One', description: null, indexing_config: {}, retrieval_config: {}, created_at: null, updated_at: null },
  { id: 'kb-2', name: 'KB Two', description: null, indexing_config: {}, retrieval_config: {}, created_at: null, updated_at: null },
]

// 11 KBs — one more than MAX_RUNTIME_KBS (10) — used only by the cap-disable
// render-guard test below, to check the 11th (unchecked) box freezes once the
// first 10 are checked, while the checked ones stay enabled.
const elevenKbs = Array.from({ length: 11 }, (_, i) => ({
  id: `kb-${i + 1}`,
  name: `KB ${i + 1}`,
  description: null,
  indexing_config: {},
  retrieval_config: {},
  created_at: null,
  updated_at: null,
}))

const oneIndexedSource = {
  items: [
    {
      id: 'idx-1',
      knowledge_base_id: 'kb-x',
      source_id: 'source-1',
      index_status: 'indexed',
      indexed_at: null,
      stats: {},
      error_message: null,
      source_name: 'Doc One',
      file_type: 'pdf',
    },
  ],
  total: 1,
  limit: 200,
  offset: 0,
}

const {
  mockStreamAgentRun,
  mockListForAgent,
  mockGetMessages,
  mockGetRuns,
  mockOrchList,
  mockKbList,
  mockListIndexedSources,
} = vi.hoisted(() => ({
  mockStreamAgentRun: vi.fn(),
  mockListForAgent: vi.fn(),
  mockGetMessages: vi.fn(),
  mockGetRuns: vi.fn(),
  mockOrchList: vi.fn(),
  mockKbList: vi.fn(),
  mockListIndexedSources: vi.fn(),
}))

vi.mock('@/hooks/ai/useProjectSupabaseClient', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    useProjectSupabaseClient: () => ({ token: 'fake-token', isReady: true }),
  }
})

vi.mock('@/lib/ai-api', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    // Self-host semantics (always-true) sidestep IS_PLATFORM entirely — the
    // token itself is what the behaviors under test care about, not the
    // platform-vs-self-host auth gate.
    hasAiAuth: () => true,
    streamAgentRun: mockStreamAgentRun,
    agentsApi: {
      list: vi.fn().mockResolvedValue({
        items: [
          { id: 'agent-1', name: 'Agent One', model: 'x', system_prompt: null, settings: {}, created_at: null, updated_at: null },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      }),
    },
    knowledgeBasesApi: {
      list: mockKbList,
      listIndexedSources: mockListIndexedSources,
    },
    orchestrationsApi: {
      list: mockOrchList,
      listSessions: vi.fn().mockResolvedValue({ sessions: [] }),
      getSessionMessages: vi.fn(),
    },
    sessionsApi: {
      ...actual.sessionsApi,
      listForAgent: mockListForAgent,
      getMessages: mockGetMessages,
      getRuns: mockGetRuns,
    },
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

// Agent selection is a native <select> (auto-selected via an effect once
// agentsApi.list resolves), not a click target — wait for that effect to
// land before interacting with the KB checkboxes or the send button, both
// of which are gated on selectedAgentId being set.
async function selectAgentAndWait() {
  await waitFor(() => {
    expect(screen.getByRole('combobox')).toHaveValue('agent-1')
  })
}

async function sendMessage(text: string) {
  const input = screen.getByPlaceholderText('Enter a query...')
  fireEvent.change(input, { target: { value: text } })
  const sendButton = screen.getByRole('button', { name: /send/i })
  fireEvent.click(sendButton)
}

describe('runs page — KB picker call-site behaviors', () => {
  beforeEach(() => {
    mockStreamAgentRun.mockReset()
    mockListForAgent.mockReset().mockResolvedValue({ sessions: [], total: 0, limit: 0, offset: 0 })
    mockGetMessages.mockReset().mockResolvedValue({ session_id: 's1', messages: [] })
    mockGetRuns.mockReset().mockResolvedValue({ session_id: 's1', runs: [] })
    mockOrchList.mockReset().mockResolvedValue({ items: [] })
    mockKbList.mockReset().mockResolvedValue({ items: twoKbs, total: twoKbs.length, limit: 100, offset: 0 })
    mockListIndexedSources.mockReset().mockResolvedValue({ items: [], total: 0, limit: 200, offset: 0 })
    window.localStorage.clear()
  })

  it('passes selected KB ids as runtime_knowledge_bases to streamAgentRun', async () => {
    mockStreamAgentRun.mockResolvedValue(undefined)
    render(<RunsPage dehydratedState={{}} />)
    await selectAgentAndWait()

    const kbOneCheckbox = await screen.findByRole('checkbox', { name: /KB One/ })
    fireEvent.click(kbOneCheckbox)

    await sendMessage('hello')

    await waitFor(() => expect(mockStreamAgentRun).toHaveBeenCalledTimes(1))
    const [, , agentId, body] = mockStreamAgentRun.mock.calls[0]
    expect(agentId).toBe('agent-1')
    expect(body.runtime_knowledge_bases).toEqual([{ id: 'kb-1' }])
    // Let handleSend's `finally` (isStreaming -> false) settle before the
    // test ends, so no state update lands after RTL's cleanup unmounts.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument())
  })

  it("clears the sent KB's selection and filters, but leaves an unselected KB's filters untouched", async () => {
    // Seeds a real source filter on both KB One (which we'll select and
    // send) and KB Two (which we'll leave unselected), driven entirely
    // through the rendered "Filter by source documents" modal — not by
    // reaching into component state. Regression target: the send-time
    // clearing logic in handleSend only deletes kbSourceFilters entries for
    // the ids that were actually sent, so this is the one test that can
    // catch it clobbering the wrong KB's filters (or all of them).
    mockStreamAgentRun.mockResolvedValue(undefined)
    mockListIndexedSources.mockResolvedValue(oneIndexedSource)
    render(<RunsPage dehydratedState={{}} />)
    await selectAgentAndWait()

    // findAllBy (not getAllBy): fetchKbs resolves independently of the agent
    // fetch that selectAgentAndWait waited on, so the KB rows may not have
    // rendered yet.
    const filterButtons = await screen.findAllByTitle('Filter by source documents')
    expect(filterButtons).toHaveLength(2) // one per KB, in list order: KB One, KB Two

    // Seed KB One's filter.
    fireEvent.click(filterButtons[0])
    const kbOneSource = await screen.findByRole('checkbox', { name: /Doc One/ })
    fireEvent.click(kbOneSource)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Doc One/ })).not.toBeInTheDocument())

    // Seed KB Two's filter.
    fireEvent.click(filterButtons[1])
    const kbTwoSource = await screen.findByRole('checkbox', { name: /Doc One/ })
    fireEvent.click(kbTwoSource)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Doc One/ })).not.toBeInTheDocument())

    // Sanity check: both KBs show a "1 filter" badge before we send anything.
    expect(screen.getAllByText('1 filter')).toHaveLength(2)

    // Select and send only KB One. Its accessible name is "KB One 1 filter"
    // at this point (the filter badge text is part of the label), so match
    // by substring rather than an exact anchor.
    const kbOneCheckbox = screen.getByRole('checkbox', { name: /KB One/ })
    fireEvent.click(kbOneCheckbox)

    await sendMessage('hello')

    await waitFor(() => expect(mockStreamAgentRun).toHaveBeenCalledTimes(1))
    const [, , , body] = mockStreamAgentRun.mock.calls[0]
    // The filter reaches the wire as source_ids on the sent KB's entry.
    expect(body.runtime_knowledge_bases).toEqual([{ id: 'kb-1', source_ids: ['source-1'] }])

    // Selection cleared: the "n/10" counter disappears once nothing is checked.
    await waitFor(() => expect(screen.queryByText('1/10')).not.toBeInTheDocument())
    const kbOneAfter = screen.getByRole('checkbox', { name: /KB One/ })
    expect(kbOneAfter).toHaveAttribute('aria-checked', 'false')

    // Exactly one "1 filter" badge remains, and it belongs to KB Two — KB
    // One's filter was cleared alongside its selection; KB Two's survived.
    await waitFor(() => expect(screen.getAllByText('1 filter')).toHaveLength(1))
    const kbTwoLabel = screen.getByText('KB Two').closest('label')
    expect(kbTwoLabel).not.toBeNull()
    expect(within(kbTwoLabel!).getByText('1 filter')).toBeInTheDocument()

    // Let handleSend's `finally` (isStreaming -> false) settle before the
    // test ends, so no state update lands after RTL's cleanup unmounts.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument())
  })

  it('restores the selection when streamAgentRun emits an SSE error event', async () => {
    const { promise, resolve } = deferred<void>()
    mockStreamAgentRun.mockImplementation(async (_token, _ref, _agentId, _body, onEvent) => {
      onEvent({ event: 'error', error: 'boom', run_id: 'r1' })
      return promise
    })
    render(<RunsPage dehydratedState={{}} />)
    await selectAgentAndWait()

    const kbOneCheckbox = await screen.findByRole('checkbox', { name: /KB One/ })
    fireEvent.click(kbOneCheckbox)

    await sendMessage('hello')
    resolve(undefined)

    await waitFor(() => expect(mockStreamAgentRun).toHaveBeenCalledTimes(1))
    // The error-event branch restores selectedKbIds before the outer catch
    // ever runs (streamAgentRun resolved normally here — it didn't throw).
    await waitFor(() => {
      const kbOneAfter = screen.getByRole('checkbox', { name: /KB One/ })
      expect(kbOneAfter).toHaveAttribute('aria-checked', 'true')
    })
    expect(screen.getByText('1/10')).toBeInTheDocument()
    // "boom" also lands in the placeholder assistant message's fallback
    // content ("Error: boom") — findAllByText and assert on the error banner
    // specifically (it renders "boom" verbatim, with no "Error:" prefix).
    const boomMatches = await screen.findAllByText(/boom/)
    expect(boomMatches.some((el) => el.textContent === 'boom')).toBe(true)
    // Let handleSend's `finally` (isStreaming -> false) settle before the
    // test ends, so no state update lands after RTL's cleanup unmounts.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument())
  })

  it('restores the selection and its filters when streamAgentRun rejects before any SSE event', async () => {
    // The originally-shipped bug path: streamAgentRun REJECTING outright
    // (e.g. an HTTP 400 raised before the response body is even read, per
    // lib/ai-api.ts's `if (!response.ok) throw ...`) — no SSE `error` event
    // ever fires, so only the outer `catch` in handleSend can restore.
    mockListIndexedSources.mockResolvedValue(oneIndexedSource)
    mockStreamAgentRun.mockRejectedValue(new Error('HTTP 400'))
    render(<RunsPage dehydratedState={{}} />)
    await selectAgentAndWait()

    // Seed a filter on KB One so the restore assertion below covers filters,
    // not just the id list.
    const filterButtons = await screen.findAllByTitle('Filter by source documents')
    fireEvent.click(filterButtons[0])
    const kbOneSource = await screen.findByRole('checkbox', { name: /Doc One/ })
    fireEvent.click(kbOneSource)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Doc One/ })).not.toBeInTheDocument())

    const kbOneCheckbox = screen.getByRole('checkbox', { name: /KB One/ })
    fireEvent.click(kbOneCheckbox)
    expect(screen.getByText('1 filter')).toBeInTheDocument()

    await sendMessage('hello')

    await waitFor(() => expect(mockStreamAgentRun).toHaveBeenCalledTimes(1))
    // The rejection is caught by the outer `catch`, which restores both the
    // selection and the filters it captured at send-time.
    await waitFor(() => {
      const kbOneAfter = screen.getByRole('checkbox', { name: /KB One/ })
      expect(kbOneAfter).toHaveAttribute('aria-checked', 'true')
    })
    expect(screen.getByText('1/10')).toBeInTheDocument()
    expect(screen.getByText('1 filter')).toBeInTheDocument()
    // "HTTP 400" also lands in the placeholder assistant message's fallback
    // content — findAllByText and assert on the error banner specifically
    // (it renders "HTTP 400" verbatim, same disambiguation the SSE-error
    // test above uses for "boom").
    const errorMatches = await screen.findAllByText('HTTP 400')
    expect(errorMatches.some((el) => el.textContent === 'HTTP 400')).toBe(true)
    // Let handleSend's `finally` (isStreaming -> false) settle before the
    // test ends, so no state update lands after RTL's cleanup unmounts.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument())
  })

  it('disables the KB checkboxes while a run is streaming', async () => {
    const { promise } = deferred<void>()
    mockStreamAgentRun.mockImplementation(() => promise) // never resolves during this test
    render(<RunsPage dehydratedState={{}} />)
    await selectAgentAndWait()

    const kbOneCheckbox = await screen.findByRole('checkbox', { name: /^KB One$/ })
    fireEvent.click(kbOneCheckbox)

    await sendMessage('hello')

    // isStreaming flips true synchronously in handleSend, before the
    // (never-resolving) streamAgentRun call — the send button's label swaps
    // to "…" once that render lands.
    await screen.findByText('…')

    const kbOneAfter = screen.getByRole('checkbox', { name: /^KB One$/ })
    const kbTwoAfter = screen.getByRole('checkbox', { name: /^KB Two$/ })
    expect(kbOneAfter).toBeDisabled()
    expect(kbTwoAfter).toBeDisabled()
    // No cleanup/resolve here by design: the promise is left pending and the
    // component unmounts mid-stream, same as a real navigate-away — the
    // unmount cleanup effect aborts the in-flight controller.
  })

  it('disables unchecked KB checkboxes once the selection reaches MAX_RUNTIME_KBS, leaving checked ones enabled', async () => {
    mockKbList.mockResolvedValue({ items: elevenKbs, total: elevenKbs.length, limit: 100, offset: 0 })
    render(<RunsPage dehydratedState={{}} />)
    await selectAgentAndWait()

    // Check the first 10 KBs — all enabled the whole way, since the cap
    // (MAX_RUNTIME_KBS = 10) isn't hit until the 10th click lands.
    for (const kb of elevenKbs.slice(0, 10)) {
      const checkbox = await screen.findByRole('checkbox', { name: new RegExp(`^${kb.name}$`) })
      expect(checkbox).not.toBeDisabled()
      fireEvent.click(checkbox)
    }
    await waitFor(() => expect(screen.getByText('10/10')).toBeInTheDocument())

    // The 11th (never-checked) box freezes at the cap...
    const kb11 = screen.getByRole('checkbox', { name: /^KB 11$/ })
    expect(kb11).toBeDisabled()
    // ...but every one of the 10 checked boxes stays enabled, so the user
    // can still deselect down from the cap.
    for (const kb of elevenKbs.slice(0, 10)) {
      const checkbox = screen.getByRole('checkbox', { name: new RegExp(`^${kb.name}$`) })
      expect(checkbox).not.toBeDisabled()
    }
  })
})
