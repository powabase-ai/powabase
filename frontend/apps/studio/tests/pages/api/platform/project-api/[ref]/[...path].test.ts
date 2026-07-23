import { createMocks } from 'node-mocks-http'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The proxy reads IS_PLATFORM (@/lib/constants) at import time, so every
// test must vi.resetModules() + re-import the handler fresh — same reason
// and pattern as lib/api/self-hosted/settings.test.ts and lib/ai-api.test.ts.
//
// SUPABASE_SERVICE_KEY / SUPABASE_URL are read from process.env live inside
// the handler body (not module-level consts), so those just need vi.stubEnv
// before each call — no reset/re-import required for them specifically.

const SELF_HOST_ENV = {
  NEXT_PUBLIC_IS_PLATFORM: 'false',
  SUPABASE_SERVICE_KEY: 'test-service-role-key',
  SUPABASE_URL: 'http://kong:8000',
}

async function loadHandler() {
  const mod = await import(
    '@/pages/api/platform/project-api/[ref]/[...path]'
  )
  return mod.default
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  global.fetch = vi.fn()
})

describe('GET/POST /api/platform/project-api/[ref]/[...path] proxy — self-host only', () => {
  it('IS_PLATFORM=true: 404s and never touches the network (prod is CP-routed, must never reach this file)', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/platform/project-api/abcdef/agents',
      query: { ref: 'abcdef', path: ['agents'] },
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(404)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('SECURITY INVARIANT: overrides a hostile inbound Authorization header with the server-side service_role — never forwards the browser value', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ agents: [] })).buffer,
    })
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/platform/project-api/default/agents',
      query: { ref: 'default', path: ['agents'] },
      headers: { authorization: 'Bearer attacker-supplied-token' },
    })

    await handler(req as any, res as any)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer test-service-role-key')
    expect(init.headers.Authorization).not.toContain('attacker-supplied-token')
    // Kong's key-auth plugin on every project-api-* route (volumes/api/kong.yml)
    // reads `apikey`, not Authorization — both must carry the service_role key or Kong 401s
    // before the request ever reaches project-service.
    expect(init.headers.apikey).toBe('test-service-role-key')
  })

  it('injects the service_role Authorization even when the browser sent none at all', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
    })
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/platform/project-api/default/agents',
      query: { ref: 'default', path: ['agents'] },
    })

    await handler(req as any, res as any)

    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer test-service-role-key')
  })

  it('builds the target URL from the local project-service via Kong, forwarding the catch-all path and query string — mirrors the control plane\'s proxy_project_api mapping (/platform/project-api/<ref>/<subpath> -> {kong}/api/<subpath>)', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
    })
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/platform/project-api/default/knowledge-bases/kb-1/sources?limit=50&offset=0',
      query: { ref: 'default', path: ['knowledge-bases', 'kb-1', 'sources'], limit: '50', offset: '0' },
    })

    await handler(req as any, res as any)

    const [url] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('http://kong:8000/api/knowledge-bases/kb-1/sources?limit=50&offset=0')
  })

  it('[ref] is accepted for URL-shape parity but ignored — a different ref still targets the single local stack', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
    })
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/platform/project-api/some-other-ref/agents',
      query: { ref: 'some-other-ref', path: ['agents'] },
    })

    await handler(req as any, res as any)

    const [url] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('http://kong:8000/api/agents')
  })

  describe('path-traversal guard', () => {
    it('rejects a literal `..` segment with 400 and never touches the network', async () => {
      for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
      const handler = await loadHandler()
      const { req, res } = createMocks({
        method: 'GET',
        url: '/api/platform/project-api/default/agents/..%2f..%2fsettings',
        query: { ref: 'default', path: ['agents', '..', '..', 'settings'] },
      })

      await handler(req as any, res as any)

      expect(res._getStatusCode()).toBe(400)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('rejects a bare `..` path with 400', async () => {
      for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
      const handler = await loadHandler()
      const { req, res } = createMocks({
        method: 'GET',
        url: '/api/platform/project-api/default/..',
        query: { ref: 'default', path: ['..'] },
      })

      await handler(req as any, res as any)

      expect(res._getStatusCode()).toBe(400)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('rejects a literal `.` segment with 400', async () => {
      for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
      const handler = await loadHandler()
      const { req, res } = createMocks({
        method: 'GET',
        url: '/api/platform/project-api/default/agents/.',
        query: { ref: 'default', path: ['agents', '.'] },
      })

      await handler(req as any, res as any)

      expect(res._getStatusCode()).toBe(400)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('rejects a single segment that smuggles a traversal via an already-decoded embedded slash (e.g. a %2f-encoded segment)', async () => {
      // Simulates what Next's catch-all router hands the handler when the
      // request URL contains a percent-encoded slash inside one segment:
      // the segment survives routing as one array element and is decoded to
      // a string containing literal '/' characters — `.` / `..` equality
      // checks on individual segments can't catch this; normalization can.
      for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
      const handler = await loadHandler()
      const { req, res } = createMocks({
        method: 'GET',
        url: '/api/platform/project-api/default/agents%2f..%2f..%2fsettings',
        query: { ref: 'default', path: ['agents/../../settings'] },
      })

      await handler(req as any, res as any)

      expect(res._getStatusCode()).toBe(400)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('rejects a `..` segment even when the normalized result would stay within the base (reject-any-dot-segment is intentionally stricter than reject-only-if-escaping)', async () => {
      for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
      const handler = await loadHandler()
      const { req, res } = createMocks({
        method: 'GET',
        url: '/api/platform/project-api/default/agents/../sources',
        query: { ref: 'default', path: ['agents', '..', 'sources'] },
      })

      await handler(req as any, res as any)

      // `agents/../sources` normalizes to `sources`, which never leaves
      // `/api/` — but it still contains a literal `..` segment, so the
      // guard's `.`/`..` equality check (not just the escape check) rejects
      // it too. Pins the current, intentionally strict behavior rather than
      // silently narrowing to "reject only if it provably escapes" — no
      // legitimate ai-api.ts caller ever builds a path with `.`/`..` in it.
      expect(res._getStatusCode()).toBe(400)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  it('forwards the raw POST body bytes to the upstream project-service', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 201,
      headers: { get: () => 'application/json' },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ id: 'agent-1' })).buffer,
    })
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/platform/project-api/default/agents',
      query: { ref: 'default', path: ['agents'] },
      headers: { 'content-type': 'application/json' },
    })
    // Start the handler, then synchronously feed the mock request stream —
    // node-mocks-http's asyncIterator attaches its 'data'/'end' listeners
    // synchronously on first consumption, so .send() must fire in the same
    // tick as (not before) the handler begins reading the body.
    const handlerPromise = handler(req as any, res as any)
    req.send(JSON.stringify({ name: 'Test Agent' }))
    await handlerPromise

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(Buffer.isBuffer(init.body)).toBe(true)
    expect(init.body.toString('utf8')).toBe(JSON.stringify({ name: 'Test Agent' }))
    expect(res._getStatusCode()).toBe(201)
  })

  it('does not attempt to read a body for GET/DELETE (mirrors the control plane proxy, which only reads POST/PUT/PATCH bodies)', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode('{"message":"deleted"}').buffer,
    })
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'DELETE',
      url: '/api/platform/project-api/default/agents/agent-1',
      query: { ref: 'default', path: ['agents', 'agent-1'] },
    })

    // No req.send() call at all — if the handler tried to read a body for
    // DELETE, this test would hang/timeout.
    await handler(req as any, res as any)

    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.body).toBeUndefined()
    expect(res._getStatusCode()).toBe(200)
  })

  it('propagates a non-2xx upstream status and body unchanged', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 404,
      headers: { get: () => 'application/json' },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ error: 'not_found' })).buffer,
    })
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/platform/project-api/default/agents/missing',
      query: { ref: 'default', path: ['agents', 'missing'] },
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(404)
    expect(JSON.parse(res._getBuffer().toString('utf8'))).toEqual({ error: 'not_found' })
  })

  it('returns 503 (not a 500 crash) when the upstream project-service is unreachable', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    ;(global.fetch as any).mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'GET',
      url: '/api/platform/project-api/default/agents',
      query: { ref: 'default', path: ['agents'] },
    })

    await handler(req as any, res as any)

    expect(res._getStatusCode()).toBe(503)
  })

  it('streams a text/event-stream response chunk-by-chunk instead of buffering (agent-run / copilot-chat SSE)', async () => {
    for (const [k, v] of Object.entries(SELF_HOST_ENV)) vi.stubEnv(k, v)
    const chunks = [
      new TextEncoder().encode('data: {"event":"start"}\n\n'),
      new TextEncoder().encode('data: {"event":"complete"}\n\n'),
    ]
    let i = 0
    const fakeBody = {
      getReader: () => ({
        read: async () => {
          if (i < chunks.length) return { done: false, value: chunks[i++] }
          return { done: true, value: undefined }
        },
      }),
    }
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      headers: { get: (name: string) => (name === 'content-type' ? 'text/event-stream' : null) },
      body: fakeBody,
    })
    const handler = await loadHandler()
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/platform/project-api/default/agents/agent-1/run/stream',
      query: { ref: 'default', path: ['agents', 'agent-1', 'run', 'stream'] },
      headers: { 'content-type': 'application/json' },
    })
    const handlerPromise = handler(req as any, res as any)
    req.send(JSON.stringify({ message: 'hi' }))
    await handlerPromise

    const written = Buffer.concat(res._getChunks() as Buffer[]).toString('utf8')
    expect(written).toBe('data: {"event":"start"}\n\ndata: {"event":"complete"}\n\n')
  })
})
