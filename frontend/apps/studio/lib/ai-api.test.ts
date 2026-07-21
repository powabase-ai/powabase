import { beforeEach, describe, expect, it, vi } from 'vitest'

// getProjectApiBaseUrl / hasAiAuth read IS_PLATFORM (@/lib/constants) at
// import time, so every test that varies NEXT_PUBLIC_IS_PLATFORM must
// vi.resetModules() + re-import fresh, mirroring lib/api/self-hosted/
// settings.test.ts's established pattern for the same reason.

describe('lib/ai-api — getProjectApiBaseUrl', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('self-host (IS_PLATFORM=false): returns a same-origin relative path through the local proxy', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    const { getProjectApiBaseUrl } = await import('./ai-api')

    expect(getProjectApiBaseUrl('default')).toBe('/api/platform/project-api/default')
  })

  it('platform (IS_PLATFORM=true): returns the control-plane base URL, unchanged from before', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://cp-backend.test/api')
    const { getProjectApiBaseUrl } = await import('./ai-api')

    expect(getProjectApiBaseUrl('abcdef')).toBe('http://cp-backend.test/api/platform/project-api/abcdef')
  })

  it('platform base URL falls back to the localhost:5000 default when NEXT_PUBLIC_API_URL is unset (pre-existing behavior, unchanged)', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    const { getProjectApiBaseUrl } = await import('./ai-api')

    expect(getProjectApiBaseUrl('abcdef')).toBe('http://localhost:5000/api/platform/project-api/abcdef')
  })

  it('SECURITY INVARIANT: the self-host base URL never embeds SUPABASE_SERVICE_KEY, regardless of its value', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    // A distinctive sentinel — if this ever leaked into a browser-facing
    // base URL/bundle, this assertion would catch it directly.
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'SENTINEL_SERVICE_ROLE_SECRET_DO_NOT_LEAK')
    const { getProjectApiBaseUrl } = await import('./ai-api')

    const url = getProjectApiBaseUrl('default')

    expect(url).not.toContain('SENTINEL_SERVICE_ROLE_SECRET_DO_NOT_LEAK')
    expect(url).toBe('/api/platform/project-api/default')
  })
})

describe('lib/ai-api — hasAiAuth', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('platform (IS_PLATFORM=true): true iff token is truthy — unchanged prod semantics', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'true')
    const { hasAiAuth } = await import('./ai-api')

    expect(hasAiAuth('a-real-gotrue-jwt')).toBe(true)
    expect(hasAiAuth('')).toBe(false)
    expect(hasAiAuth(null)).toBe(false)
    expect(hasAiAuth(undefined)).toBe(false)
  })

  it('self-host (IS_PLATFORM=false): always true — there is no browser token to check; the server-side proxy injects service_role regardless', async () => {
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', 'false')
    const { hasAiAuth } = await import('./ai-api')

    expect(hasAiAuth('')).toBe(true)
    expect(hasAiAuth(null)).toBe(true)
    expect(hasAiAuth(undefined)).toBe(true)
    expect(hasAiAuth('anything')).toBe(true)
  })
})
