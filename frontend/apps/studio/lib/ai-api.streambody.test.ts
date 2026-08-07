import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pin for the `runtime_knowledge_bases` field name.
//
// streamAgentRun's body type declares both `knowledge_bases` (the persistent,
// agent-level KB config) and `runtime_knowledge_bases` (the playground's
// per-request picker selection, added for the runtime-kb-references work).
// The two are easy to typo into each other under autocomplete — this pins
// the exact field name that reaches the wire so a future edit that silently
// renames/merges them fails loudly here instead of only in a live stream.

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  global.fetch = vi.fn()
})

function mockStreamResponse() {
  return {
    status: 200,
    ok: true,
    body: {
      getReader: () => ({
        read: async () => ({ done: true, value: undefined }),
        releaseLock: () => {},
      }),
    },
  }
}

describe('lib/ai-api — streamAgentRun request body', () => {
  it('sends runtime_knowledge_bases when passed', async () => {
    ;(global.fetch as any).mockResolvedValueOnce(mockStreamResponse())
    const { streamAgentRun } = await import('./ai-api')

    await streamAgentRun(
      'a-token',
      'default',
      'agent_1',
      { message: 'x', runtime_knowledge_bases: [{ id: 'kb-1' }] } as any,
      () => {}
    )

    const [, init] = (global.fetch as any).mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(sentBody).toHaveProperty('runtime_knowledge_bases')
    expect(sentBody.runtime_knowledge_bases).toEqual([{ id: 'kb-1' }])
  })

  it('serializes ONLY message + runtime_knowledge_bases when that is all that was passed', async () => {
    // streamAgentRun never adds fields of its own — it JSON.stringifies
    // exactly the object the caller passed. So the wire body's key set must
    // equal the caller's key set, with no `knowledge_bases` (the sibling,
    // persistent-config field) sneaking in. Asserting the exact key set
    // (not just "knowledge_bases absent", which is true of any body that
    // never included it) is what actually pins the two fields apart: it
    // would fail if a future edit ever merged/renamed them, or added any
    // other stray key to the request.
    ;(global.fetch as any).mockResolvedValueOnce(mockStreamResponse())
    const { streamAgentRun } = await import('./ai-api')

    await streamAgentRun(
      'a-token',
      'default',
      'agent_1',
      { message: 'x', runtime_knowledge_bases: [{ id: 'kb-1' }] } as any,
      () => {}
    )

    const [, init] = (global.fetch as any).mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(Object.keys(sentBody).sort()).toEqual(['message', 'runtime_knowledge_bases'])
  })
})
