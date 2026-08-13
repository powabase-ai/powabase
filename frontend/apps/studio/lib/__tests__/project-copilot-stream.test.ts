import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  CopilotPaymentRequiredError,
  CopilotRequestFailedError,
  streamProjectCopilotChat,
} from '../ai-api'

// A previous fix added 402/409/503 typed-error parsing to
// streamCopilotChat (the workflow copilot) but not to streamProjectCopilotChat
// (the one ProjectCopilotPanel actually calls), so a 402 fell through to the
// generic `!response.ok` throw and ProjectCopilotPanel's recovery block
// (gated on `err instanceof CopilotPaymentRequiredError`) was unreachable —
// the just-typed message silently vanished. This test drives a real 402
// through streamProjectCopilotChat to pin the fix.
describe('streamProjectCopilotChat', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('throws CopilotPaymentRequiredError with the parsed balance/renews_at on a 402', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 402,
      ok: false,
      json: async () => ({ balance: 0, estimated_cost: 5, renews_at: '2026-08-01T00:00:00Z' }),
    })

    const err = await streamProjectCopilotChat(
      'token',
      'ref',
      'session-1',
      { message: 'hi' },
      () => {}
    ).catch((e) => e)

    expect(err).toBeInstanceOf(CopilotPaymentRequiredError)
    expect((err as CopilotPaymentRequiredError).balance).toBe(0)
    expect((err as CopilotPaymentRequiredError).estimated_cost).toBe(5)
    expect((err as CopilotPaymentRequiredError).renews_at).toBe('2026-08-01T00:00:00Z')
  })

  // 402/409/503 got typed errors, but every OTHER non-OK
  // pre-stream status (500 when the user-message INSERT throws pre-commit, 429,
  // gateway 502/504 during fleet rolls) still fell through to a generic
  // `throw new Error(...)`, which ProjectCopilotPanel's `instanceof` recovery
  // gate doesn't match — so the history reload wiped the optimistic user bubble
  // and the typed message silently vanished. Pin that any unmapped non-OK
  // throws a typed CopilotRequestFailedError the panel can recover from.
  it('throws CopilotRequestFailedError carrying the status on an unmapped 500', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: async () => ({ error: 'internal server error' }),
    })

    const err = await streamProjectCopilotChat(
      'token',
      'ref',
      'session-1',
      { message: 'hi' },
      () => {}
    ).catch((e) => e)

    expect(err).toBeInstanceOf(CopilotRequestFailedError)
    expect((err as CopilotRequestFailedError).status).toBe(500)
  })
})
