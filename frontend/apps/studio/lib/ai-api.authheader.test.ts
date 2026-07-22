import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pin for the self-host "Session expired" bug.
//
// Studio is reached through Kong's `dashboard` catch-all route, which carries
// the `basic-auth` plugin. The browser attaches `Authorization: Basic <creds>`
// automatically — but an EXPLICIT Authorization header on a fetch REPLACES it,
// so Kong 401s the request. (Verified against a live stack: ANY Bearer value
// 401s there, even a valid service_role, because the route requires Basic.)
// lib/ai-api.ts then maps that 401 to SessionExpiredError, surfacing a bogus
// "Session expired. Please refresh the page to sign in again." toast on a
// perfectly healthy deployment.
//
// In self-host `token` is '' (no GoTrue session — see hasAiAuth), so any
// unconditional `Bearer ${token}` sends `Authorization: Bearer ` and breaks.
// These tests pin BOTH branches for the hand-rolled fetch call sites that
// bypass api() (multipart upload + SSE streams), which is exactly where the
// guard drifted: api() had `if (token)`, the nine hand-rolled callers did not.
//
// Mirrors upstream's data/fetchers.ts:constructHeaders semantics, and the
// existing assertions in lib/ai-api/storage.test.ts.

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  global.fetch = vi.fn()
})

function mockResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

describe('lib/ai-api — aiAuthHeader', () => {
  it('omits Authorization entirely for a falsy token (self-host has no GoTrue session)', async () => {
    const { aiAuthHeader } = await import('./ai-api')

    expect(aiAuthHeader('')).toEqual({})
    expect(aiAuthHeader(null)).toEqual({})
    expect(aiAuthHeader(undefined)).toEqual({})
  })

  it('sets Bearer for a real token (platform semantics unchanged)', async () => {
    const { aiAuthHeader } = await import('./ai-api')

    expect(aiAuthHeader('a-real-gotrue-jwt')).toEqual({
      Authorization: 'Bearer a-real-gotrue-jwt',
    })
  })
})

describe('lib/ai-api — projectApiUpload (multipart; bypasses api())', () => {
  it('self-host: sends NO Authorization header, so Kong basic-auth survives', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    ;(global.fetch as any).mockResolvedValueOnce(mockResponse({ id: 'src_1' }, 201))
    const { projectApiUpload } = await import('./ai-api')

    await projectApiUpload('', 'default', '/sources/upload', new FormData())

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('/api/platform/project-api/default/sources/upload')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('platform: unchanged — forwards the real Bearer token', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://cp-backend.test/api')
    ;(global.fetch as any).mockResolvedValueOnce(mockResponse({ id: 'src_1' }, 201))
    const { projectApiUpload } = await import('./ai-api')

    await projectApiUpload('a-real-gotrue-jwt', 'abcdef', '/sources/upload', new FormData())

    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer a-real-gotrue-jwt')
  })
})

describe('lib/ai-api — streamAgentRun (SSE; bypasses api())', () => {
  it('self-host: sends NO Authorization header', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
          // streamAgentRun calls releaseLock() in a finally — the mock must
          // provide it or the test fails on the teardown path, not the assertion.
          releaseLock: () => {},
        }),
      },
    })
    const { streamAgentRun } = await import('./ai-api')

    await streamAgentRun('', 'default', 'agent_1', { message: 'hi' } as any, () => {})

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('/api/platform/project-api/default/agents/agent_1/run/stream')
    expect(init.headers.Authorization).toBeUndefined()
    // Content-Type must survive the change — only auth is conditional.
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('platform: unchanged — forwards the real Bearer token', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://cp-backend.test/api')
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
          // streamAgentRun calls releaseLock() in a finally — the mock must
          // provide it or the test fails on the teardown path, not the assertion.
          releaseLock: () => {},
        }),
      },
    })
    const { streamAgentRun } = await import('./ai-api')

    await streamAgentRun('a-real-gotrue-jwt', 'abcdef', 'agent_1', { message: 'hi' } as any, () => {})

    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer a-real-gotrue-jwt')
  })
})
