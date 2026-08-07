import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customRender as render } from '@/tests/lib/custom-render'
import RunsPage from '@/pages/project/[ref]/runs/index'

// This mounts the actual runs page (not a mock shell) so the assertions
// below pin real call-site behavior: what streamAgentRun is invoked with,
// and how the KB picker's selection reacts to a successful send, an SSE
// `error` event, and the over-cap guard added alongside this test file.
// `RunsPage.getLayout` (DefaultLayout/AILayout) is a Next.js page-level
// concern applied by _app.tsx, not by the component itself, so rendering
// `<RunsPage />` directly exercises the real component with no layout stub
// needed.

const twoKbs = [
  { id: 'kb-1', name: 'KB One', description: null, indexing_config: {}, retrieval_config: {}, created_at: null, updated_at: null },
  { id: 'kb-2', name: 'KB Two', description: null, indexing_config: {}, retrieval_config: {}, created_at: null, updated_at: null },
]

// 11 KBs — one more than MAX_RUNTIME_KBS (10) — used only by the over-cap
// guard test below, so checking every one of them simulates a bulk-set past
// the cap (see the `ui` mock note further down for why checking that many
// through the rendered checkboxes is otherwise blocked).
const elevenKbs = Array.from({ length: 11 }, (_, i) => ({
  id: `kb-${i + 1}`,
  name: `KB ${i + 1}`,
  description: null,
  indexing_config: {},
  retrieval_config: {},
  created_at: null,
  updated_at: null,
}))

const {
  mockStreamAgentRun,
  mockListForAgent,
  mockGetMessages,
  mockGetRuns,
  mockOrchList,
  mockKbList,
} = vi.hoisted(() => ({
  mockStreamAgentRun: vi.fn(),
  mockListForAgent: vi.fn(),
  mockGetMessages: vi.fn(),
  mockGetRuns: vi.fn(),
  mockOrchList: vi.fn(),
  mockKbList: vi.fn(),
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
    // token itself is what the four behaviors under test care about, not
    // the platform-vs-self-host auth gate.
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
      listIndexedSources: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 200, offset: 0 }),
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

// The picker's checkboxes render via the real Radix `Checkbox_Shadcn_`,
// which sets a genuine `disabled` attribute once the 10-KB cap is hit —
// jsdom (like a real browser) refuses to fire click handlers on a disabled
// control, so there is no way to drive selectedKbIds past the cap through
// the rendered UI. That's by design (Fix 3/4 of the prior review pass). But
// the guard under test here (N2) exists precisely FOR the case where
// selectedKbIds gets bulk-set past 10 through some path other than these
// checkboxes (a future "select all", a restored session) — so to exercise
// it we swap in a lenient checkbox that ignores `disabled` and always fires
// onCheckedChange, simulating that kind of bulk-set via ordinary clicks.
vi.mock('ui', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    Checkbox_Shadcn_: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (v: boolean) => void }) => (
      <button
        type="button"
        role="checkbox"
        aria-checked={!!checked}
        data-state={checked ? 'checked' : 'unchecked'}
        onClick={() => onCheckedChange?.(!checked)}
      />
    ),
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

  it("clears the selection after a successful send but leaves unselected KBs' filters untouched", async () => {
    mockStreamAgentRun.mockResolvedValue(undefined)
    render(<RunsPage dehydratedState={{}} />)
    await selectAgentAndWait()

    const kbOneCheckbox = await screen.findByRole('checkbox', { name: /KB One/ })
    fireEvent.click(kbOneCheckbox)
    expect(screen.getByText('1/10')).toBeInTheDocument()

    await sendMessage('hello')

    await waitFor(() => expect(mockStreamAgentRun).toHaveBeenCalledTimes(1))
    // Selection cleared: the "n/10" counter disappears once nothing is checked.
    await waitFor(() => expect(screen.queryByText('1/10')).not.toBeInTheDocument())
    const kbOneAfter = screen.getByRole('checkbox', { name: /KB One/ })
    expect(kbOneAfter).toHaveAttribute('aria-checked', 'false')
    // KB Two was never selected — nothing about it should have been touched.
    const kbTwoAfter = screen.getByRole('checkbox', { name: /KB Two/ })
    expect(kbTwoAfter).toHaveAttribute('aria-checked', 'false')
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

  it('blocks the send when selectedKbIds exceeds MAX_RUNTIME_KBS, without calling streamAgentRun', async () => {
    mockKbList.mockResolvedValue({ items: elevenKbs, total: elevenKbs.length, limit: 100, offset: 0 })
    render(<RunsPage dehydratedState={{}} />)
    await selectAgentAndWait()

    for (const kb of elevenKbs) {
      const checkbox = await screen.findByRole('checkbox', { name: new RegExp(`^${kb.name}$`) })
      fireEvent.click(checkbox)
    }
    expect(screen.getByText('11/10')).toBeInTheDocument()

    await sendMessage('hello')

    // The guard in handleSend fires before the optimistic message append or
    // the streamAgentRun call — same tick, no need to waitFor an async
    // resolution.
    expect(mockStreamAgentRun).not.toHaveBeenCalled()
    expect(await screen.findByText(/Select up to 10 knowledge bases/)).toBeInTheDocument()
    // The user's typed message is preserved (send was rejected, not consumed).
    expect(screen.getByPlaceholderText('Enter a query...')).toHaveValue('hello')
  })
})
