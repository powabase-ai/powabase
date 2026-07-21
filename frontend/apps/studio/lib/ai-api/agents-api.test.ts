import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only databaseMetaApi.getSchemasAndTables is covered here — it's the one
// function in this file that reads IS_PLATFORM directly (everything else
// routes through projectApi(), already covered by lib/ai-api.test.ts's
// getProjectApiBaseUrl coverage). Reads IS_PLATFORM (@/lib/constants) at
// call time, so every test that varies NEXT_PUBLIC_IS_PLATFORM must
// vi.resetModules() + re-import fresh — mirrors lib/ai-api.test.ts /
// lib/ai-api/storage.test.ts's established pattern for the same reason.
//
// Like storage.ts, this has no NEW self-host proxy: it reuses upstream
// Studio's pre-existing self-hosted pg-meta backend
// (pages/api/platform/pg-meta/[ref]/tables.ts).

async function loadDatabaseMetaApi() {
  const mod = await import('./agents-api')
  return mod.databaseMetaApi
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  global.fetch = vi.fn()
})

describe('databaseMetaApi.getSchemasAndTables', () => {
  it('self-host (IS_PLATFORM=false): GETs the native self-hosted pg-meta tables route, same-origin, no Authorization header', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => [],
    })
    const databaseMetaApi = await loadDatabaseMetaApi()

    await databaseMetaApi.getSchemasAndTables('', 'default')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('/api/platform/pg-meta/default/tables?include_columns=true')
    expect(init).toBeUndefined()
  })

  it('platform (IS_PLATFORM=true): unchanged — GETs the control-plane pg-meta proxy with a Bearer token', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://cp-backend.test/api')
    ;(global.fetch as any).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => [],
    })
    const databaseMetaApi = await loadDatabaseMetaApi()

    await databaseMetaApi.getSchemasAndTables('a-real-gotrue-jwt', 'abcdef')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('http://cp-backend.test/api/platform/pg-meta/abcdef/tables?include_columns=true')
    expect(init.headers.Authorization).toBe('Bearer a-real-gotrue-jwt')
  })
})
