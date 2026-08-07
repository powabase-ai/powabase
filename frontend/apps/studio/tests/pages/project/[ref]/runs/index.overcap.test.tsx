import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customRender as render } from '@/tests/lib/custom-render'
import RunsPage from '@/pages/project/[ref]/runs/index'

// Split out from index.test.tsx: this is the one test that needs a lenient
// KB checkbox stub, so it carries the file-wide `vi.mock('ui', ...)` on its
// own rather than making every other test in that file pay for it (the
// stub drops the real `disabled` attribute, which would make the two
// render-guard assertions in index.test.tsx pass even if the guards
// themselves were deleted — false confidence). See the `ui` mock comment
// below for why this test specifically needs it.

const elevenKbs = Array.from({ length: 11 }, (_, i) => ({
  id: `kb-${i + 1}`,
  name: `KB ${i + 1}`,
  description: null,
  indexing_config: {},
  retrieval_config: {},
  created_at: null,
  updated_at: null,
}))

const { mockStreamAgentRun, mockListForAgent, mockGetMessages, mockGetRuns, mockOrchList, mockKbList } =
  vi.hoisted(() => ({
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
    // token itself is what this test cares about, not the
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
// the rendered UI. That's by design (the two render-guard tests in
// index.test.tsx pin it). But the guard under test here (the send-time
// MAX_RUNTIME_KBS check in handleSend) exists precisely FOR the case where
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

describe('runs page — KB picker over-cap guard', () => {
  beforeEach(() => {
    mockStreamAgentRun.mockReset()
    mockListForAgent.mockReset().mockResolvedValue({ sessions: [], total: 0, limit: 0, offset: 0 })
    mockGetMessages.mockReset().mockResolvedValue({ session_id: 's1', messages: [] })
    mockGetRuns.mockReset().mockResolvedValue({ session_id: 's1', runs: [] })
    mockOrchList.mockReset().mockResolvedValue({ items: [] })
    mockKbList.mockReset().mockResolvedValue({ items: elevenKbs, total: elevenKbs.length, limit: 100, offset: 0 })
    window.localStorage.clear()
  })

  it('blocks the send when selectedKbIds exceeds MAX_RUNTIME_KBS, without calling streamAgentRun', async () => {
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
